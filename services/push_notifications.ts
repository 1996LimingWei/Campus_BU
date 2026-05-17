import * as Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import storage from '../lib/storage';
import { supabase } from './supabase';

export interface PushTokenData {
    id: string;
    userId: string;
    token: string;
    platform?: string;
}

const PUSH_NOTIFICATIONS_ENABLED_KEY_PREFIX = 'hkcampus_push_notifications_enabled';

const getPushNotificationsEnabledKey = (userId: string) => `${PUSH_NOTIFICATIONS_ENABLED_KEY_PREFIX}:${userId}`;

// Global configuration for how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// --- Deferred push token registration ---
// When initial registration fails due to network, we store the userId and
// retry once the app comes back to the foreground (a common signal that
// network may have been restored).

let pendingUserId: string | null = null;
let appStateListenerRegistered = false;

function scheduleDeferredRegistration(userId: string) {
    pendingUserId = userId;

    if (!appStateListenerRegistered) {
        appStateListenerRegistered = true;
        AppState.addEventListener('change', async (state) => {
            if (state === 'active' && pendingUserId) {
                const uid = pendingUserId;
                pendingUserId = null;
                console.log('[Push] Retrying deferred push token registration for:', uid);
                await enablePushForUser(uid);
            }
        });
    }
}

async function enablePushForUser(userId: string): Promise<boolean> {
    const token = await registerForPushNotificationsAsync();
    if (!token) {
        scheduleDeferredRegistration(userId);
        return false;
    }

    const saved = await savePushToken(userId, token);
    if (!saved) {
        scheduleDeferredRegistration(userId);
        return false;
    }

    pendingUserId = null;
    return true;
}

/**
 * Requests permission and gets the Expo Push Token for the current device.
 * Includes retry logic for transient network failures.
 * @returns The Expo push token string or undefined if failed/denied
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications');
        return undefined;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification! (Permission denied)');
        return undefined;
    }

    const projectId = Constants.default.expoConfig?.extra?.eas?.projectId || Constants.default.easConfig?.projectId;
    if (!projectId) {
        console.warn('Project ID not found in app.json. Add it in extra.eas.projectId.');
    }

    // Retry up to 3 times with exponential backoff for transient network errors
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            console.log('Expo Push Token generated:', tokenData.data);
            return tokenData.data;
        } catch (e: any) {
            const isNetworkError =
                e?.message?.includes('Network request failed') ||
                e?.message?.includes('fetch') ||
                e?.code === 'ECONNABORTED' ||
                e?.code === 'ENOTFOUND';

            if (isNetworkError && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(`[Push] Token registration failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            console.error('Error generating Expo Push Token:', e);
            return undefined;
        }
    }

    return undefined;
}

/**
 * Saves a push token to the user_push_tokens table in Supabase.
 * @param userId The UID of the authenticated user
 * @param token The Expo Push Token string
 */
export async function savePushToken(userId: string, token: string): Promise<boolean> {
    if (!userId || !token) return false;

    try {
        const platform = Platform.OS;

        const { error } = await supabase
            .from('user_push_tokens')
            .upsert(
                {
                    user_id: userId,
                    token: token,
                    platform: platform
                },
                { onConflict: 'user_id, token' }
            );

        if (error) {
            console.error('Error saving push token to Supabase:', error);
            return false;
        }

        console.log('Successfully saved push token for user:', userId);
        return true;
    } catch (error) {
        console.error('Exception in savePushToken:', error);
        return false;
    }
}

export async function getPushNotificationsEnabled(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
        const value = await storage.getItem(getPushNotificationsEnabledKey(userId));
        return value === 'true';
    } catch (error) {
        console.error('Error reading push notification preference:', error);
        return false;
    }
}

export async function setPushNotificationsEnabled(userId: string, enabled: boolean): Promise<boolean> {
    if (!userId) return false;

    try {
        if (enabled) {
            const success = await enablePushForUser(userId);
            if (!success) return false;
        } else {
            const removed = await removePushToken(userId);
            if (!removed) return false;
        }

        await storage.setItem(getPushNotificationsEnabledKey(userId), enabled ? 'true' : 'false');
        return true;
    } catch (error) {
        console.error('Error updating push notification preference:', error);
        return false;
    }
}

/**
 * Removes a specific push token from the database (e.g., on logout)
 */
export async function removePushToken(userId: string, token?: string): Promise<boolean> {
    if (!userId) return false;

    // Cancel any pending deferred registration for this user
    if (pendingUserId === userId) {
        pendingUserId = null;
    }

    try {
        const query = supabase
            .from('user_push_tokens')
            .delete()
            .eq('user_id', userId);

        const { error } = token
            ? await query.eq('token', token)
            : await query;

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error removing push token:', error);
        return false;
    }
}

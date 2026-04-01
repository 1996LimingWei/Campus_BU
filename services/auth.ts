import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { User } from '../types';
import { compressImageForUpload } from '../utils/image';
import { IMMUTABLE_STORAGE_CACHE_CONTROL } from '../utils/remoteImage';
import { supabase } from './supabase';

// Global flag to skip auth redirects during password reset flow
let skipAuthRedirect = false;

export const setSkipAuthRedirect = (skip: boolean) => {
    skipAuthRedirect = skip;
};

export const shouldSkipAuthRedirect = () => skipAuthRedirect;

// Helper to generate a random Bustar nickname
export const generateDefaultNickname = () => {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `Bustar${randomNum}`;
};

// --- OTP Flow Functions ---

/**
 * Send a 6-digit OTP to the school email.
 * For HKBU, we expect the email to end with @life.hkbu.edu.hk
 */
export const sendOTP = async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
            shouldCreateUser: true, // This enables the "Register/Login Combined" flow
        }
    });
    if (error) throw error;
};

/**
 * Verify the OTP entered by the user.
 */
export const verifyOTP = async (email: string, token: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'signup', // or 'sms' depending on config, but for email usually signup/magiclink
    });

    // If signup fails, try verification for login
    if (error) {
        const { data: loginData, error: loginError } = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token,
            type: 'magiclink',
        });
        if (loginError) throw loginError;
        return loginData.user ? { ...loginData.user, uid: loginData.user.id } : null;
    }

    return data.user ? { ...data.user, uid: data.user.id } : null;
};

// --- Biometric Authentication ---

/**
 * Check if the device hardware supports biometrics
 */
export const checkBiometricSupport = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
};

/**
 * Authenticate using Face ID or Fingerprint
 */
export const authenticateBiometric = async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '请验证身份以登录 HKCampus',
        fallbackLabel: '使用密码登录',
        disableDeviceFallback: false,
    });
    return result.success;
};

// Sign up (Redirect to OTP)
export const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    if (error) throw error;
    return data.user ? { ...data.user, uid: data.user.id } : null;
};

// Sign in
export const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });
    if (error) throw error;

    return data.user ? { ...data.user, uid: data.user.id } : null;
};

// Sign out
export const signOut = async () => {
    await supabase.auth.signOut();
};

// Delete account
export const deleteAccount = async () => {
    // Attempt standard Supabase RPC convention for user deletion.
    // The server-side RPC must complete successfully before we clear the local session.
    const { error } = await supabase.rpc('delete_user');
    if (error) {
        console.warn('[auth.ts] delete_user RPC returned error:', error);
        throw error;
    }

    await signOut();
};

/**
 * Update user password (used after OTP verification or in settings)
 */
export const updatePassword = async (password: string) => {
    const { data, error } = await supabase.auth.updateUser({
        password: password
    });
    if (error) throw error;
    return data.user;
};

// Create user profile in Supabase (users table)
export const createUserProfile = async (
    uid: string,
    displayName: string,
    major: string,
    avatarUrl: string = '',
    email: string = ''
) => {
    const userData: User = {
        uid, // Will be stored as 'id' in DB if column name differs, but usually we map JSON
        displayName,
        major,
        email,
        avatarUrl,
        createdAt: new Date(), // Supabase handles timestamp, but we keep structure
    };

    // We assume a 'users' table exists with these columns.
    // In Supabase, you might need to handle column name mapping (snake_case vs camelCase)
    // For now, we assume the table accepts this JSON (if columns match) or we map it:
    const { error } = await supabase
        .from('users')
        .upsert({
            id: uid,
            display_name: displayName,
            major: major,
            avatar_url: avatarUrl,
            email: email,
            updated_at: new Date().toISOString(),
        });

    if (error) {
        console.error('Error creating profile:', error);
        throw error; // Throw so the UI can show the error
    }
    return userData;
};

// Get user profile
export const getUserProfile = async (uid: string): Promise<User | null> => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // PostgREST error for "no rows returned"
        if (isTransientNetworkError(error)) {
            console.warn('[auth.ts] transient profile fetch failure');
        } else {
            console.error('Error fetching profile:', error);
        }
        throw error; // Rethrow actual errors (network, permissions, etc.)
    }
    if (!data) return null;

    // Map back to User type (snake_case -> camelCase)
    return {
        uid: data.id,
        displayName: data.display_name || data.displayName, // Fallback
        major: data.major,
        email: data.email,
        avatarUrl: data.avatar_url || data.avatarUrl,
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
    } as User;
};

const isTransientNetworkError = (error: unknown): boolean => {
    const message = error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
            ? String((error as any).message)
            : String(error || '');

    return /network request failed|failed to fetch|networkerror|load failed/i.test(message);
};

export type UserSearchResult = {
    uid: string;
    displayName: string;
    major: string;
    email?: string;
    avatarUrl: string;
};

export const searchUserProfiles = async (query: string, limit: number = 20): Promise<UserSearchResult[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }

    const { data, error } = await supabase
        .from('users')
        .select('id, display_name, major, email, avatar_url')
        .or(`display_name.ilike.%${trimmedQuery}%,major.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%`)
        .limit(limit);

    if (error) {
        console.error('Error searching users:', error);
        throw error;
    }

    return (data || []).map((row: any) => ({
        uid: row.id,
        displayName: row.display_name || 'Anonymous',
        major: row.major || 'Student',
        email: row.email || '',
        avatarUrl: row.avatar_url || '',
    }));
};

// Auth state listener
export const onAuthChange = (callback: (user: any | null) => void) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ? { ...session.user, uid: session.user.id } : null;
        callback(user);
    });
    return () => data.subscription.unsubscribe();
};

// Get current user from the active Supabase session
export const getCurrentUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        const user = session.user;
        let profile: User | null = null;

        try {
            profile = await getUserProfile(user.id);
        } catch (error) {
            if (!isTransientNetworkError(error)) {
                throw error;
            }

            console.warn('[auth.ts] getCurrentUser falling back to session user after transient profile fetch failure');
        }

        const avatar = profile?.avatarUrl || user.user_metadata?.avatar_url;

        return {
            ...user,
            uid: user.id,
            displayName: profile?.displayName || user.user_metadata?.display_name || 'Anonymous',
            major: profile?.major || 'Student',
            avatarUrl: avatar,
            photoURL: avatar, // Backwards compatibility
            email: user.email // Explicitly include email
        };
    }
    return null;
};

// Re-export auth as compatibility object if needed, but preferably avoid usage.
export const auth = supabase.auth;

// --- Avatar Upload Functions ---

const USER_AVATARS_BUCKET = 'user-avatars';

/**
 * Check if a string is a local file path (not a URL)
 */
const isLocalFilePath = (uri: string): boolean => {
    if (!uri) return false;
    return uri.startsWith('file://') ||
        uri.startsWith('/var/') ||
        uri.startsWith('/data/') ||
        uri.includes('ImagePicker') ||
        uri.includes('ExponentExperienceData');
};

/**
 * Upload user avatar to Supabase Storage
 * Files are stored in a folder named after the user's ID
 * @param userId - The user's unique ID
 * @param imageUri - Local file URI from image picker
 * @returns Public URL of the uploaded avatar
 */
export const uploadUserAvatar = async (userId: string, imageUri: string): Promise<string> => {
    try {
        const compressedUri = await compressImageForUpload(imageUri, 'avatar');

        // Create a unique filename: userId/timestamp.jpg
        const timestamp = Date.now();
        const fileName = `${userId}/avatar_${timestamp}.jpg`;

        // Delete old avatar files for this user (keep storage clean)
        try {
            const { data: existingFiles } = await supabase.storage
                .from(USER_AVATARS_BUCKET)
                .list(userId);

            if (existingFiles && existingFiles.length > 0) {
                const filesToDelete = existingFiles.map(file => `${userId}/${file.name}`);
                await supabase.storage
                    .from(USER_AVATARS_BUCKET)
                    .remove(filesToDelete);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors, proceed with upload
            console.warn('Avatar cleanup warning:', cleanupError);
        }

        // Read the file as base64 using expo-file-system (most reliable in React Native)
        const base64Data = await FileSystem.readAsStringAsync(compressedUri, {
            encoding: 'base64',
        });

        // Decode base64 to ArrayBuffer for Supabase
        const arrayBuffer = decode(base64Data);

        // Upload the new avatar
        const { data, error } = await supabase.storage
            .from(USER_AVATARS_BUCKET)
            .upload(fileName, arrayBuffer, {
                contentType: 'image/jpeg',
                cacheControl: IMMUTABLE_STORAGE_CACHE_CONTROL,
                upsert: true,
            });

        if (error) {
            console.error('Avatar upload error:', error);
            throw error;
        }

        // Get the public URL
        const { data: { publicUrl } } = supabase.storage
            .from(USER_AVATARS_BUCKET)
            .getPublicUrl(fileName);

        return publicUrl;
    } catch (e) {
        console.error('Failed to upload avatar:', e);
        throw e;
    }
};

/**
 * Update user's avatar URL in the database
 * @param userId - The user's unique ID
 * @param avatarUrl - The public URL of the avatar
 */
export const updateUserAvatarUrl = async (userId: string, avatarUrl: string): Promise<void> => {
    const { error } = await supabase
        .from('users')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        console.error('Error updating avatar URL:', error);
        throw error;
    }
};

/**
 * Upload avatar and update user profile in one call
 * @param userId - The user's unique ID
 * @param imageUri - Local file URI from image picker
 * @returns The new avatar public URL
 */
export const uploadAndUpdateAvatar = async (userId: string, imageUri: string): Promise<string> => {
    // Only upload if it's a local file
    if (!isLocalFilePath(imageUri)) {
        // If it's already a URL, just update the database
        await updateUserAvatarUrl(userId, imageUri);
        return imageUri;
    }

    // Upload the image
    const publicUrl = await uploadUserAvatar(userId, imageUri);

    // Update the user profile with the new URL
    await updateUserAvatarUrl(userId, publicUrl);

    return publicUrl;
};

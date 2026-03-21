import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { StartupAnimation } from '../components/common/StartupAnimation';
import { CourseActivityProvider } from '../context/CourseActivityContext';
import { LoginPromptProvider } from '../context/LoginPromptContext';
import { NotificationProvider } from '../context/NotificationContext';
import '../global.css';
import { getUserProfile, isDemoMode, onAuthChange, shouldSkipAuthRedirect } from '../services/auth';
import { prefetchBuildings } from '../services/buildings';
import { prefetchLocalCourses } from '../services/courses';
import './i18n/i18n'; // Initialize i18n
import { i18nPromise } from './i18n/i18n';

const DEMO_MODE_KEY = 'hkcampus_demo_mode';

// Keep native splash visible until RootLayout mounts, then hide it without transition.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore when splash screen is already controlled by the runtime
});

// Helper to set demo mode
export const setDemoMode = async (enabled: boolean) => {
  if (enabled) {
    await AsyncStorage.setItem(DEMO_MODE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(DEMO_MODE_KEY);
  }
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  const [loading, setLoading] = useState(true);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);

  // Keep segmentsRef in sync with latest segments
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    SplashScreen.setOptions({
      fade: false,
      duration: 0,
    });
    void SplashScreen.hideAsync().catch(() => {
      // ignore if already hidden
    });
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      // Ensure i18n is initialized
      await i18nPromise;

      // Check for demo mode first
      const demoMode = await isDemoMode();
      if (demoMode) {
        const inAuthGroup = segmentsRef.current[0] === '(auth)';
        if (inAuthGroup) {
          router.replace('/(tabs)/campus');
        }
        setLoading(false);
        return;
      }

      // Normal auth check
      const unsubscribe = onAuthChange(async (user) => {
        try {
          // Skip all redirects if the flag is set (during password reset flow)
          if (shouldSkipAuthRedirect()) {
            setLoading(false);
            return;
          }

          // Use ref to get latest segments value
          const currentSegments = segmentsRef.current;
          const inAuthGroup = currentSegments[0] === '(auth)';
          const currentSegment = currentSegments.length > 1 ? (currentSegments as string[])[1] : currentSegments[0] || '';

          // Check if forgot-password exists anywhere in segments (more robust check)
          const isForgotPasswordPage = (currentSegments as string[]).includes('forgot-password');

          if (!user) {
            // Guest mode logic:
            // Allow access to (tabs), campus/*, forum/*, courses/* etc.
            // Only redirect to login if they are NOT in the auth group AND NOT on a public page
            const publicGroups = ['(tabs)', 'campus', 'forum', 'courses', 'map', 'classroom'];
            const isPublicPage = publicGroups.includes(currentSegments[0]);

            if (!inAuthGroup && !isPublicPage && !isForgotPasswordPage) {
              router.replace('/(auth)/login');
            }
          } else {
            // Initiate background data prefetching as soon as we know we have a user
            prefetchLocalCourses().catch(e => console.log('Prefetch courses failed:', e));
            prefetchBuildings().catch(e => console.log('Prefetch buildings failed:', e));

            const profile = await getUserProfile(user.uid);

            if (!profile) {
              // Only redirect to setup if we're not currently in verify or forgot-password flow
              if (currentSegment !== 'setup' &&
                currentSegment !== 'verify' &&
                !isForgotPasswordPage) {
                router.replace('/(auth)/setup');
              }
            } else {
              if (inAuthGroup) {
                // Don't auto-redirect if user is on forgot-password page
                if (currentSegment !== 'setup' && !isForgotPasswordPage) {
                  router.replace('/(tabs)/campus');
                }
              }
            }
          }
        } catch (err) {
          console.error('RootLayout Auth Check Error:', err);
          // If profile fetch fails due to network, don't yank the user to setup
          // Just let them stay where they are or handle at component level
        }
        setLoading(false);
      });

      return unsubscribe;
    };

    checkAuth();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {(!isAnimationFinished || loading) && (
        <StartupAnimation
          isAppReady={!loading}
          onFinish={() => setIsAnimationFinished(true)}
        />
      )}
      <LoginPromptProvider>
        <NotificationProvider>
          <CourseActivityProvider>
            <Stack
              screenOptions={{
                animation: 'slide_from_right',
                animationDuration: 400,
                headerShown: false,
              }}
            />
            <StatusBar style="auto" />
          </CourseActivityProvider>
        </NotificationProvider>
      </LoginPromptProvider>
    </GestureHandlerRootView>
  );
}

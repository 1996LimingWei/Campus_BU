import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import 'react-native-url-polyfill/auto';
import { StartupAnimation } from '../components/common/StartupAnimation';
import '../global.css';
import { getUserProfile, isDemoMode, onAuthChange, shouldSkipAuthRedirect } from '../services/auth';
import './i18n/i18n'; // Initialize i18n

const DEMO_MODE_KEY = 'hkcampus_demo_mode';

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
    const checkAuth = async () => {
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
          const isForgotPasswordPage = currentSegments.includes('forgot-password');

          if (!user) {
            // Don't redirect to login if on forgot-password page (user just signed out after password check)
            if (!inAuthGroup && !isForgotPasswordPage) {
              router.replace('/(auth)/login');
            }
          } else {
            const profile = await getUserProfile(user.uid);

            if (!profile) {
              // Only redirect to setup if we're not currently in verify or forgot-password flow
              // and we're sure the profile really doesn't exist
              if (currentSegment !== 'setup' &&
                currentSegment !== 'verify' &&
                !isForgotPasswordPage) {
                router.replace('/(auth)/setup');
              }
            } else if (inAuthGroup) {
              // Don't auto-redirect if user is on forgot-password page (password reset flow)
              if (currentSegment !== 'setup' && !isForgotPasswordPage) {
                router.replace('/(tabs)/campus');
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

  if (loading || !isAnimationFinished) {
    return (
      <StartupAnimation onFinish={() => setIsAnimationFinished(true)} />
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          animationDuration: 400,
          headerShown: false,
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}

import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { EULAModal } from '../components/common/EULAModal';
import { StartupAnimation } from '../components/common/StartupAnimation';
import { CourseActivityProvider } from '../context/CourseActivityContext';
import { LoginPromptProvider } from '../context/LoginPromptContext';
import { NotificationProvider } from '../context/NotificationContext';
import '../global.css';
import { getUserProfile, onAuthChange, shouldSkipAuthRedirect } from '../services/auth';
import { prefetchBuildings } from '../services/buildings';
import { prefetchLocalCourses } from '../services/courses';
import { acceptCommunityEula, hasAcceptedCommunityEula } from '../services/moderation';
import './i18n/i18n'; // Initialize i18n
import { i18nPromise } from './i18n/i18n';

// Keep native splash visible until RootLayout mounts, then hide it without transition.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore when splash screen is already controlled by the runtime
});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  const [loading, setLoading] = useState(true);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [eulaVisible, setEulaVisible] = useState(false);

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
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      const title = String(response.notification.request.content.title || '');
      const match = title.match(/(\d{4}-\d{2}-\d{2})/);
      const digestDate = match?.[1];

      if (data?.type === 'system' && title.includes('今日AI资讯摘要')) {
        router.push({
          pathname: '/agent/chat',
          params: digestDate ? { digestDate } : undefined,
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      // Ensure i18n is initialized
      await i18nPromise;

      // Normal auth check
      const unsubscribe = onAuthChange(async (user) => {
        try {
          setCurrentUser(user);

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

  useEffect(() => {
    const root = segments[0] || '';
    const tab = segments[1] || '';

    const requiresEula =
      (root === '(tabs)' && ['campus', 'course', 'messages'].includes(tab))
      || ['campus', 'forum', 'courses', 'teachers', 'messages'].includes(root);

    if (!requiresEula) {
      setEulaVisible(false);
      return;
    }

    let cancelled = false;
    const checkEulaGate = async () => {
      const accepted = await hasAcceptedCommunityEula(currentUser?.uid || null);
      if (!cancelled) {
        setEulaVisible(!accepted);
      }
    };

    void checkEulaGate();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, segments]);

  const handleAcceptEula = async () => {
    const accepted = await acceptCommunityEula(currentUser?.uid || null);
    if (accepted) {
      setEulaVisible(false);
    }
  };

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
            <EULAModal visible={eulaVisible} onAccept={handleAcceptEula} />
            <StatusBar style="auto" />
          </CourseActivityProvider>
        </NotificationProvider>
      </LoginPromptProvider>
    </GestureHandlerRootView>
  );
}

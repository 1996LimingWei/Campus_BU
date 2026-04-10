import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Copy, Globe, Heart as HeartIcon, HelpCircle, LogOut, Mail, MessageSquare, Shield, Sparkles, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FollowListModal } from '../../components/profile/FollowListModal';
import MyScheduleCard from '../../components/profile/MyScheduleCard';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { ProfileMessages } from '../../components/profile/ProfileMessages';
import { ProfilePostFeed } from '../../components/profile/ProfilePostFeed';
import { ProfileTabs, ProfileTabType } from '../../components/profile/ProfileTabs';
import { useNotifications } from '../../context/NotificationContext';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { deleteAccount, getCurrentUser, getUserProfile, signOut, uploadAndUpdateAvatar } from '../../services/auth';
import { getDailyDigestEnabled, setDailyDigestEnabled as updateDailyDigestEnabled } from '../../services/agent/dailyDigest';
import { fetchAnonymousPostsByAuthor, fetchLikedPosts, fetchPostsByAuthor, togglePostLike } from '../../services/campus';
import { getFollowCounts } from '../../services/follows';
import { fetchNotifications, markAllAsRead, markAsRead, Notification, subscribeToNotifications } from '../../services/notifications';
import { getPushNotificationsEnabled, setPushNotificationsEnabled as updatePushNotificationsEnabled } from '../../services/push_notifications';
import { supabase } from '../../services/supabase';
import { fetchUnreadModerationAlertCount } from '../../services/moderation';
import { Post, User as UserProfile } from '../../types';
import { isAdmin } from '../../utils/userUtils';
import { getDeleteAccountErrorAlertCopy, getDeleteAccountSuccessAlertCopy } from '../../utils/deleteAccountFeedback';
import { changeLanguage } from '../i18n/i18n';

// Helper to check if avatar URL is valid (not a local file path)
const isValidAvatarUrl = (url?: string) => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
};

const LANGUAGE_OPTIONS = [
    { key: 'zh-Hans', label: '简' },
    { key: 'zh-Hant', label: '繁' },
    { key: 'en', label: 'EN' },
];

type ProfileScreenCache = {
    profile: UserProfile | null;
    userId: string | null;
    userEmail: string;
    notifications: Notification[];
    pushNotificationsEnabled: boolean;
    dailyDigestEnabled: boolean;
    isAdminUser: boolean;
    adminModerationUnreadCount: number;
};

let profileScreenCache: ProfileScreenCache | null = null;

export default function ProfileScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [showNotifications, setShowNotifications] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>(() => profileScreenCache?.notifications || []);
    const [loadingNotifications, setLoadingNotifications] = useState(() => !profileScreenCache);
    const [loadingProfile, setLoadingProfile] = useState(() => !profileScreenCache);
    const [pushNotificationsEnabled, setPushNotificationsEnabledState] = useState(() => profileScreenCache?.pushNotificationsEnabled || false);
    const [pushNotificationsLoading, setPushNotificationsLoading] = useState(false);
    const [dailyDigestEnabled, setDailyDigestEnabledState] = useState(() => profileScreenCache?.dailyDigestEnabled || false);
    const [dailyDigestLoading, setDailyDigestLoading] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(() => profileScreenCache?.profile || null);
    const [userId, setUserId] = useState<string | null>(() => profileScreenCache?.userId || null);
    const [userEmail, setUserEmail] = useState(() => profileScreenCache?.userEmail || '');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [isAdminUser, setIsAdminUser] = useState(() => profileScreenCache?.isAdminUser || false);
    const [adminModerationUnreadCount, setAdminModerationUnreadCount] = useState(() => profileScreenCache?.adminModerationUnreadCount || 0);
    const loadTokenRef = useRef(0);
    const { checkLogin } = useLoginPrompt();

    const { unreadCount: globalUnreadCount, messageUnreadCount, refreshCount: refreshGlobalCount } = useNotifications();
    const unreadCount = notifications.filter(n => !n.is_read).length;

    const loadData = async () => {
        const loadToken = ++loadTokenRef.current;
        try {
            if (!profile && !userId) {
                setLoadingProfile(true);
            }
            setLoadingNotifications(true);
            const user = await getCurrentUser();
            if (loadToken !== loadTokenRef.current) {
                return;
            }

            if (user) {
                setUserId(user.uid);
                setUserEmail(user.email || '');

                // Critical path first: render real profile quickly, avoid Guest flicker.
                const [userProfile, followCounts] = await Promise.all([
                    getUserProfile(user.uid),
                    getFollowCounts(user.uid),
                ]);
                if (loadToken !== loadTokenRef.current) {
                    return;
                }
                if (userProfile) {
                    setProfile({
                        ...userProfile,
                        email: userProfile.email || user.email || '',
                        stats: {
                            postsCount: 0,
                            followersCount: followCounts.followersCount,
                            followingCount: followCounts.followingCount,
                            appreciationCount: 0,
                        },
                    });
                } else {
                    setProfile(null);
                }
                setLoadingProfile(false);

                // Non-critical data in parallel: avoid blocking first paint.
                const [enabled, digestEnabled, adminStatus, notifData] = await Promise.all([
                    getPushNotificationsEnabled(user.uid),
                    getDailyDigestEnabled(user.uid),
                    isAdmin(user.uid),
                    fetchNotifications(user.uid),
                ]);
                if (loadToken !== loadTokenRef.current) {
                    return;
                }

                setPushNotificationsEnabledState(enabled);
                setDailyDigestEnabledState(digestEnabled);
                setIsAdminUser(adminStatus);
                setNotifications(notifData);

                let adminUnreadCount = 0;
                if (adminStatus) {
                    const unreadCount = await fetchUnreadModerationAlertCount(user.uid);
                    if (loadToken !== loadTokenRef.current) {
                        return;
                    }
                    setAdminModerationUnreadCount(unreadCount);
                    adminUnreadCount = unreadCount;
                } else {
                    setAdminModerationUnreadCount(0);
                }

                profileScreenCache = {
                    profile: userProfile ? {
                        ...userProfile,
                        email: userProfile.email || user.email || '',
                        stats: {
                            postsCount: 0,
                            followersCount: followCounts.followersCount,
                            followingCount: followCounts.followingCount,
                            appreciationCount: 0,
                        },
                    } : null,
                    userId: user.uid,
                    userEmail: user.email || '',
                    notifications: notifData,
                    pushNotificationsEnabled: enabled,
                    dailyDigestEnabled: digestEnabled,
                    isAdminUser: adminStatus,
                    adminModerationUnreadCount: adminUnreadCount,
                };
            } else {
                setProfile(null);
                setUserId(null);
                setUserEmail('');
                setNotifications([]);
                setPushNotificationsEnabledState(false);
                setDailyDigestEnabledState(false);
                setIsAdminUser(false);
                setAdminModerationUnreadCount(0);
                setLoadingProfile(false);
                profileScreenCache = {
                    profile: null,
                    userId: null,
                    userEmail: '',
                    notifications: [],
                    pushNotificationsEnabled: false,
                    dailyDigestEnabled: false,
                    isAdminUser: false,
                    adminModerationUnreadCount: 0,
                };
            }
        } catch (error) {
            console.error('[Profile] Error loading data:', error);
            if (loadToken === loadTokenRef.current) {
                setLoadingProfile(false);
            }
        } finally {
            if (loadToken === loadTokenRef.current) {
                setLoadingNotifications(false);
            }
        }
    };

    useEffect(() => {
        if (!profileScreenCache || !profileScreenCache.userId) {
            void loadData();
        }
        return () => {
            loadTokenRef.current += 1;
        };
    }, []);

    useEffect(() => {
        if (loadingProfile || loadingNotifications) {
            return;
        }
        profileScreenCache = {
            profile,
            userId,
            userEmail,
            notifications,
            pushNotificationsEnabled,
            dailyDigestEnabled,
            isAdminUser,
            adminModerationUnreadCount,
        };
    }, [
        adminModerationUnreadCount,
        dailyDigestEnabled,
        isAdminUser,
        loadingNotifications,
        loadingProfile,
        notifications,
        profile,
        pushNotificationsEnabled,
        userEmail,
        userId,
    ]);

    useEffect(() => {
        let subscription: any;
        const initSubscription = async () => {
            const user = await getCurrentUser();
            if (user) {
                subscription = subscribeToNotifications(user.uid, (payload) => {
                    if (payload.new) {
                        setNotifications(prev => [payload.new, ...prev]);
                    }
                });
            }
        };

        initSubscription();

        return () => {
            if (subscription) subscription.unsubscribe();
        };
    }, []);

    const resolveNotificationRoute = async (relatedId: string): Promise<string | null> => {
        const [postResult, exchangeResult] = await Promise.all([
            supabase.from('posts').select('id').eq('id', relatedId).maybeSingle(),
            supabase.from('course_exchanges').select('id').eq('id', relatedId).maybeSingle(),
        ]);

        if (postResult.data) return `/campus/${relatedId}`;
        if (exchangeResult.data) return '/courses/exchange';
        return null;
    };

    const handleNotificationPress = async (notification: Notification) => {
        if (!notification.is_read) {
            try {
                await markAsRead(notification.id);
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, is_read: true } : n
                ));
                await refreshGlobalCount();
            } catch (error) {
                console.error('Error marking notification read:', error);
            }
        }

        if (notification.related_id) {
            setShowNotifications(false);
            try {
                const route = await resolveNotificationRoute(notification.related_id);
                if (route) {
                    router.push(route as any);
                    return;
                }
            } catch (error) {
                console.error('Error resolving notification route:', error);
            }

            // Fallback for legacy/invalid related IDs
            const content = (notification.content || '').toLowerCase();
            if (content.includes('exchange')) {
                router.push('/courses/exchange');
            } else {
                router.push('/(tabs)/campus');
            }
        }
    };

    const handleMarkAllRead = async () => {
        if (!userId) return;
        try {
            await markAllAsRead(userId);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            await refreshGlobalCount();
        } catch (error) {
            console.error('Error marking all read:', error);
        }
    };

    const handleLanguageChange = async (lang: string) => {
        await changeLanguage(lang);
    };

    const handlePushNotificationsToggle = async (nextEnabled: boolean) => {
        if (!userId) {
            checkLogin(userId);
            return;
        }

        setPushNotificationsLoading(true);
        try {
            const ok = await updatePushNotificationsEnabled(userId, nextEnabled);
            if (!ok) {
                Alert.alert(
                    t('common.tip'),
                    nextEnabled
                        ? t('profile.push_notifications_enable_failed', 'Could not enable notifications. Please check permission and try again.')
                        : t('profile.push_notifications_disable_failed', 'Could not disable notifications. Please try again.')
                );
                return;
            }

            setPushNotificationsEnabledState(nextEnabled);
        } finally {
            setPushNotificationsLoading(false);
        }
    };

    const handleDailyDigestToggle = async (nextEnabled: boolean) => {
        if (!userId) {
            checkLogin(userId);
            return;
        }

        setDailyDigestLoading(true);
        try {
            await updateDailyDigestEnabled(userId, nextEnabled);
            setDailyDigestEnabledState(nextEnabled);
        } catch (error) {
            console.error('Error updating daily digest preference:', error);
            Alert.alert(
                t('common.tip'),
                nextEnabled
                    ? t('profile.daily_digest_enable_failed', 'Could not enable AI Daily Digest. Please try again.')
                    : t('profile.daily_digest_disable_failed', 'Could not disable AI Daily Digest. Please try again.')
            );
        } finally {
            setDailyDigestLoading(false);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            t('profile.sign_out'),
            t('profile.sign_out_confirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('profile.sign_out'),
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                        profileScreenCache = null;
                        router.replace('/(auth)/login');
                    }
                }
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('profile.delete_account'),
            t('profile.delete_account_confirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('profile.delete_account'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteAccount();
                            const successCopy = getDeleteAccountSuccessAlertCopy(t);
                            profileScreenCache = null;
                            Alert.alert(successCopy.title, successCopy.message, [
                                {
                                    text: t('common.ok'),
                                    onPress: () => router.replace('/(auth)/login'),
                                }
                            ]);
                        } catch (e) {
                            console.error('Delete account failed:', e);
                            const errorCopy = getDeleteAccountErrorAlertCopy(t);
                            Alert.alert(errorCopy.title, errorCopy.message);
                        }
                    }
                }
            ]
        );
    };

    const handleCopyText = async (text: string) => {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(text);
        Alert.alert(t('common.tip'), t('profile.help_copied'));
    };

    const handleAvatarPress = async () => {
        if (!checkLogin(userId)) return;
        const ImagePicker = await import('expo-image-picker');

        // Request permission
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                t('common.permission_required', 'Permission Required'),
                t('profile.photo_permission', 'Please allow access to photos to change your avatar')
            );
            return;
        }

        // Launch image picker
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
            return;
        }

        const imageUri = result.assets[0].uri;
        setUploadingAvatar(true);

        try {
            if (!userId) return;
            const newAvatarUrl = await uploadAndUpdateAvatar(userId, imageUri);

            // Update local profile state
            setProfile(prev => prev ? { ...prev, avatarUrl: newAvatarUrl } : null);

            Alert.alert(t('common.success', 'Success'), t('profile.avatar_updated', 'Avatar updated successfully'));
        } catch (error: any) {
            console.error('Avatar upload failed:', error);
            Alert.alert(
                t('common.error', 'Error'),
                t('profile.avatar_upload_failed', 'Failed to upload avatar. Please try again.')
            );
        } finally {
            setUploadingAvatar(false);
        }
    };

    const renderNotificationContent = (notification: Notification): string => {
        try {
            const data = JSON.parse(notification.content);
            if (data && data.key) {
                return t(data.key, data.params) as string;
            }
        } catch (e) {
            // Not a JSON string, fallback to original content
        }

        // Backward compatibility: localize legacy hard-coded English content
        const raw = (notification.content || '').trim();
        const lower = raw.toLowerCase();

        const postCommentMatch = raw.match(/^(.*?)\s+commented on your post\.?$/i);
        if (postCommentMatch) {
            return t('notifications.post_comment', { name: postCommentMatch[1] }) as string;
        }

        const postReplyMatch = raw.match(/^(.*?)\s+replied to your comment\.?$/i);
        if (postReplyMatch) {
            return t('notifications.post_reply', { name: postReplyMatch[1] }) as string;
        }

        if (lower.includes('liked your post')) {
            const contentMatch = raw.match(/liked your post:\s*["“](.+?)(?:\.\.\.)?["”]/i);
            return t('notifications.post_like', { content: contentMatch?.[1] || 'post' }) as string;
        }

        const exchangeCommentMatch = raw.match(/^(.*?)\s+commented on your\s+(.*?)\s+exchange\.?$/i);
        if (exchangeCommentMatch) {
            return t('notifications.exchange_comment', {
                name: exchangeCommentMatch[1],
                course: exchangeCommentMatch[2],
            }) as string;
        }

        const exchangeLikeMatch = raw.match(/liked your\s+(.*?)\s+exchange request/i);
        if (exchangeLikeMatch) {
            return t('notifications.exchange_like', { course: exchangeLikeMatch[1] }) as string;
        }

        const teamingCommentMatch = raw.match(/^(.*?)\s+commented on your\s+(.*?)\s+teaming request\.?$/i);
        if (teamingCommentMatch) {
            return t('notifications.teaming_comment', {
                name: teamingCommentMatch[1],
                course: teamingCommentMatch[2],
            }) as string;
        }

        const teamingLikeMatch = raw.match(/liked your\s+(.*?)\s+teaming request/i);
        if (teamingLikeMatch) {
            return t('notifications.teaming_like', { course: teamingLikeMatch[1] }) as string;
        }

        const reviewLikeMatch = raw.match(/liked your review for\s+(.*?)!?$/i);
        if (reviewLikeMatch) {
            return t('notifications.review_like', { course: reviewLikeMatch[1] }) as string;
        }

        return raw;
    };

    const renderNotificationTitle = (notification: Notification): string => {
        if (notification.title.startsWith('notifications.')) {
            return t(notification.title) as string;
        }

        // Backward compatibility: localize legacy plain-text titles (e.g. "New Comment")
        const normalizedTitle = (notification.title || '').toLowerCase().trim();
        if (
            normalizedTitle.includes('reply') ||
            normalizedTitle.includes('回复') ||
            normalizedTitle.includes('回覆')
        ) {
            return t('notifications.title_reply') as string;
        }
        if (
            normalizedTitle.includes('comment') ||
            normalizedTitle.includes('评论') ||
            normalizedTitle.includes('評論')
        ) {
            return t('notifications.title_comment') as string;
        }
        if (
            normalizedTitle.includes('like') ||
            normalizedTitle.includes('点赞') ||
            normalizedTitle.includes('點贊') ||
            normalizedTitle.includes('赞') ||
            normalizedTitle.includes('讚')
        ) {
            return t('notifications.title_like') as string;
        }

        // Type-based fallback for old rows with non-localized titles
        if (notification.type === 'comment') {
            return t('notifications.title_comment') as string;
        }
        if (notification.type === 'like') {
            return t('notifications.title_like') as string;
        }

        return notification.title;
    };

    const [activeTab, setActiveTab] = useState<ProfileTabType>('posts');
    const [hasLoadedContent, setHasLoadedContent] = useState(false);
    const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
    const [profileMode, setProfileMode] = useState<'overview' | 'messages' | 'content'>('overview');
    const [posts, setPosts] = useState<Post[]>([]);
    const [privatePosts, setPrivatePosts] = useState<Post[]>([]);
    const [likedPosts, setLikedPosts] = useState<Post[]>([]);

    const loadUserPosts = async (uid: string) => {
        try {
            const data = await fetchPostsByAuthor(uid, uid);
            setPosts(data);
        } catch (error) {
            console.error('Error loading user posts:', error);
        }
    };

    const loadLikedPosts = async (uid: string) => {
        try {
            const data = await fetchLikedPosts(uid, uid);
            setLikedPosts(data);
        } catch (error) {
            console.error('Error loading liked posts:', error);
        }
    };

    const loadPrivatePosts = async (uid: string) => {
        try {
            const data = await fetchAnonymousPostsByAuthor(uid, uid);
            setPrivatePosts(data);
        } catch (error) {
            console.error('Error loading private posts:', error);
        }
    };

    const handleLikePost = async (postId: string) => {
        if (!userId) return;
        try {
            await togglePostLike(postId, userId);
            await Promise.all([loadUserPosts(userId), loadPrivatePosts(userId), loadLikedPosts(userId)]);
        } catch (error) {
            console.error('Error toggling like in profile:', error);
        }
    };

    useEffect(() => {
        if (profileMode === 'content' && !hasLoadedContent) {
            setHasLoadedContent(true);
        }
    }, [hasLoadedContent, profileMode]);

    useEffect(() => {
        if (profileMode === 'messages' && !hasLoadedMessages) {
            setHasLoadedMessages(true);
        }
    }, [hasLoadedMessages, profileMode]);

    useEffect(() => {
        if (userId && hasLoadedContent) {
            Promise.all([loadUserPosts(userId), loadPrivatePosts(userId), loadLikedPosts(userId)]);
        } else {
            setPosts([]);
            setPrivatePosts([]);
            setLikedPosts([]);
        }
    }, [hasLoadedContent, userId]);

    const pagerRef = React.useRef<ScrollView>(null);
    const scrollX = React.useRef(new Animated.Value(0)).current;
    const { width: SCREEN_W } = Dimensions.get('window');
    const [followModalVisible, setFollowModalVisible] = useState(false);
    const [followModalTab, setFollowModalTab] = useState<'followers' | 'following'>('followers');

    const scrollToMode = (mode: 'overview' | 'messages' | 'content') => {
        const index = mode === 'overview' ? 0 : mode === 'messages' ? 1 : 2;
        pagerRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
        setProfileMode(mode);
    };

    const handleFollowStatsPress = (tab: 'followers' | 'following') => {
        setFollowModalTab(tab);
        setFollowModalVisible(true);
    };

    const onPagerScroll = (e: any) => {
        const x = e.nativeEvent.contentOffset.x;
        const index = Math.round(x / SCREEN_W);
        const newMode = index === 0 ? 'overview' : index === 1 ? 'messages' : 'content';
        if (newMode !== profileMode) setProfileMode(newMode);
    };

    return (
        <View style={styles.container}>
            {/* Blue Top Header Bar */}
            <View style={styles.blueHeader}>
                <Text style={styles.blueHeaderTitle}>{t('profile.title')}</Text>
            </View>

            {/* Profile Header Card */}
            <ProfileHeader
                user={profile}
                loading={loadingProfile}
                isCurrentUser={true}
                onEditPress={() => router.push('/(auth)/setup')}
                onSettingsPress={() => { }}
                onFollowStatsPress={userId ? handleFollowStatsPress : undefined}
            />

            {/* Premium Tab Switcher */}
            <View style={styles.pageTabContainer}>
                <TouchableOpacity
                    style={styles.pageTab}
                    onPress={() => scrollToMode('overview')}
                >
                    <Text style={[styles.pageTabText, profileMode === 'overview' && styles.pageTabTextActive]}>
                        {t('profile.tabs_overview')}
                    </Text>
                    {profileMode === 'overview' && <View style={styles.pageTabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.pageTab}
                    onPress={() => scrollToMode('messages')}
                >
                    <View style={styles.pageTabLabelRow}>
                        <Text style={[styles.pageTabText, profileMode === 'messages' && styles.pageTabTextActive]}>
                            {t('profile.tabs_messages')}
                        </Text>
                        {messageUnreadCount > 0 && (
                            <View style={styles.pageTabBadge}>
                                <Text style={styles.pageTabBadgeText}>
                                    {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                    {profileMode === 'messages' && <View style={styles.pageTabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.pageTab}
                    onPress={() => scrollToMode('content')}
                >
                    <Text style={[styles.pageTabText, profileMode === 'content' && styles.pageTabTextActive]}>
                        {t('profile.tabs_works')}
                    </Text>
                    {profileMode === 'content' && <View style={styles.pageTabIndicator} />}
                </TouchableOpacity>
            </View>

            <Animated.ScrollView
                ref={pagerRef as any}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={1}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false },
                )}
                onMomentumScrollEnd={onPagerScroll}
                style={{ flex: 1 }}
            >
                {/* Page 0: Overview */}
                <ScrollView
                    style={{ width: SCREEN_W }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContentPager}
                >
                    <MyScheduleCard userId={userId} />

                    {/* Notifications Section */}
                    <View style={styles.section}>
                        <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                            <View style={styles.settingLeft}>
                                <Bell size={18} color="#1E3A8A" />
                                <Text style={[styles.sectionTitle, { marginLeft: 10, marginBottom: 0 }]}>{t('profile.notifications')}</Text>
                                {unreadCount > 0 && (
                                    <View style={styles.countBadgeInline}>
                                        <Text style={styles.countTextInline}>{unreadCount}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => {
                                if (checkLogin(userId)) setShowNotifications(true);
                            }}>
                                <Text style={styles.seeAllText}>{t('profile.see_all')}</Text>
                            </TouchableOpacity>
                        </View>

                        {loadingNotifications ? (
                            <ActivityIndicator color="#1E3A8A" />
                        ) : !userId ? (
                            <TouchableOpacity onPress={() => checkLogin(userId)}>
                                <Text style={styles.emptyText}>{t('profile.login_view_notifications', 'Login to view notifications')}</Text>
                            </TouchableOpacity>
                        ) : notifications.length === 0 ? (
                            <Text style={styles.emptyText}>{t('profile.no_notifications')}</Text>
                        ) : (
                            <View style={styles.notificationPreviewList}>
                                {notifications.slice(0, 2).map((notif) => (
                                    <TouchableOpacity
                                        key={notif.id}
                                        style={[styles.notifPreviewItem, !notif.is_read && styles.notifUnread]}
                                        onPress={() => handleNotificationPress(notif)}
                                    >
                                        <View style={[styles.notifPreviewIcon, {
                                            backgroundColor: notif.type === 'comment' ? '#DBEAFE' :
                                                notif.type === 'like' ? '#FEE2E2' : '#F5F3FF'
                                        }]}>
                                            {notif.type === 'comment' ? <MessageSquare size={14} color="#2563EB" /> :
                                                notif.type === 'like' ? <HeartIcon size={14} color="#EF4444" /> :
                                                    <Sparkles size={14} color="#8B5CF6" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.notifPreviewTitle} numberOfLines={1}>
                                                {renderNotificationTitle(notif)}
                                            </Text>
                                            <Text style={styles.notifPreviewContent} numberOfLines={1}>
                                                {renderNotificationContent(notif)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>


                    {/* Language Switcher */}
                    <View style={styles.section}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <Globe size={20} color="#1E3A8A" />
                                <Text style={styles.settingLabel}>{t('profile.language')}</Text>
                            </View>
                        </View>
                        <Text style={styles.settingHint}>{t('profile.language_hint')}</Text>
                        <View style={styles.langSwitcher}>
                            {LANGUAGE_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[
                                        styles.langBtn,
                                        currentLang === opt.key && styles.langBtnActive
                                    ]}
                                    onPress={() => handleLanguageChange(opt.key)}
                                >
                                    <Text style={[
                                        styles.langBtnText,
                                        currentLang === opt.key && styles.langBtnTextActive
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Push Notifications */}
                    {userId && (
                        <View style={styles.section}>
                            <View style={styles.settingRow}>
                                <View style={styles.settingLeft}>
                                    <Bell size={20} color="#1E3A8A" />
                                    <Text style={styles.settingLabel}>{t('profile.push_notifications')}</Text>
                                </View>
                                <Switch
                                    value={pushNotificationsEnabled}
                                    onValueChange={handlePushNotificationsToggle}
                                    disabled={pushNotificationsLoading}
                                    trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                                    thumbColor={pushNotificationsEnabled ? '#1E3A8A' : '#FFFFFF'}
                                />
                            </View>
                            <Text style={styles.settingHint}>
                                {pushNotificationsEnabled
                                    ? t('profile.push_notifications_enabled_hint')
                                    : t('profile.push_notifications_disabled_hint')}
                            </Text>
                        </View>
                    )}

                    {userId && (
                        <View style={styles.section}>
                            <View style={styles.settingRow}>
                                <View style={styles.settingLeft}>
                                    <Sparkles size={20} color="#1E3A8A" />
                                    <Text style={styles.settingLabel}>{t('profile.daily_digest')}</Text>
                                </View>
                                <Switch
                                    value={dailyDigestEnabled}
                                    onValueChange={handleDailyDigestToggle}
                                    disabled={!pushNotificationsEnabled || dailyDigestLoading}
                                    trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                                    thumbColor={dailyDigestEnabled ? '#1E3A8A' : '#FFFFFF'}
                                />
                            </View>
                            <Text style={styles.settingHint}>
                                {!pushNotificationsEnabled
                                    ? t('profile.daily_digest_requires_push')
                                    : dailyDigestEnabled
                                        ? t('profile.daily_digest_enabled_hint')
                                        : t('profile.daily_digest_disabled_hint')}
                            </Text>
                        </View>
                    )}

                    {/* Settings */}
                    <View style={styles.section}>
                        {isAdminUser && (
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => router.push('/admin/moderation' as any)}
                            >
                                <Shield size={20} color="#1E3A8A" />
                                <Text style={styles.menuText}>{t('profile.moderation_workbench', '审核工作台')}</Text>
                                <View style={styles.menuRight}>
                                    {adminModerationUnreadCount > 0 && (
                                        <View style={styles.menuAlertBadge}>
                                            <Text style={styles.menuAlertBadgeText}>
                                                {adminModerationUnreadCount > 99 ? '99+' : adminModerationUnreadCount}
                                            </Text>
                                        </View>
                                    )}
                                    <ChevronRight size={20} color="#9CA3AF" />
                                </View>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                if (!checkLogin(userId)) return;
                                router.push('/profile/blocked-users' as any);
                            }}
                        >
                            <Shield size={20} color="#6B7280" />
                            <Text style={styles.menuText}>{t('profile.blocked_users', '已屏蔽用户')}</Text>
                            <ChevronRight size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => router.push({ pathname: '/legal', params: { tab: 'privacy' } } as any)}
                        >
                            <Shield size={20} color="#6B7280" />
                            <Text style={styles.menuText}>{t('profile.privacy')}</Text>
                            <ChevronRight size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => setShowHelp(true)}
                        >
                            <HelpCircle size={20} color="#6B7280" />
                            <Text style={styles.menuText}>{t('profile.help')}</Text>
                            <ChevronRight size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    </View>

                    {/* Sign Out / Sign In */}
                    {userId ? (
                        <View>
                            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                                <LogOut size={20} color="#EF4444" />
                                <Text style={styles.signOutText}>{t('profile.sign_out')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.signOutButton, { marginTop: 12, backgroundColor: 'transparent', borderWidth: 0 }]}
                                onPress={handleDeleteAccount}
                            >
                                <Text style={[styles.signOutText, { color: '#9CA3AF', fontSize: 13 }]}>{t('profile.delete_account')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.signOutButton, { borderColor: '#1E3A8A' }]}
                            onPress={() => router.replace('/(auth)/login')}
                        >
                            <ChevronRight size={20} color="#1E3A8A" />
                            <Text style={[styles.signOutText, { color: '#1E3A8A' }]}>{t('profile.login_signup')}</Text>
                        </TouchableOpacity>
                    )}
                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Page 1: Messages */}
                <View style={{ width: SCREEN_W }}>
                    {hasLoadedMessages ? (
                        <ProfileMessages />
                    ) : (
                        <View style={styles.lazyPagePlaceholder}>
                            <Text style={styles.lazyPagePlaceholderText}>{t('messages.title')}</Text>
                        </View>
                    )}
                </View>

                {/* Page 2: My Content */}
                <ScrollView
                    style={{ width: SCREEN_W }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContentPager}
                >
                    <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} />
                    <ProfilePostFeed
                        activeTab={activeTab}
                        posts={posts}
                        privatePosts={privatePosts}
                        likedPosts={likedPosts}
                        onPostPress={(postId: string) => router.push(`/campus/${postId}` as any)}
                        onLikePost={handleLikePost}
                        currentUserId={userId || undefined}
                        onAuthorPress={(authorId) => {
                            if (!userId || authorId === userId) return;
                            router.push(`/profile/${authorId}` as any);
                        }}
                    />
                    <View style={{ height: 100 }} />
                </ScrollView>
            </Animated.ScrollView>

            <View style={{ height: 100 }} />

            {/* Notifications Modal */}
            <Modal
                visible={showNotifications}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowNotifications(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{t('profile.notifications')}</Text>
                        <TouchableOpacity onPress={() => setShowNotifications(false)} style={styles.closeButton}>
                            <X size={24} color="#1F2937" />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={notifications}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.notificationsList}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.notificationItem, !item.is_read && styles.notificationUnread]}
                                onPress={() => handleNotificationPress(item)}
                            >
                                <View style={[styles.notifIcon, {
                                    backgroundColor: item.type === 'comment' ? '#DBEAFE' :
                                        item.type === 'like' ? '#FEE2E2' : '#F5F3FF'
                                }]}>
                                    {item.type === 'comment' ? (
                                        <MessageSquare size={18} color="#2563EB" />
                                    ) : item.type === 'like' ? (
                                        <HeartIcon size={18} color="#EF4444" />
                                    ) : (
                                        <Sparkles size={18} color="#8B5CF6" />
                                    )}
                                </View>
                                <View style={styles.notifContent}>
                                    <View style={styles.headerRow}>
                                        <Text style={styles.notifTitle} numberOfLines={1}>
                                            {renderNotificationTitle(item)}
                                        </Text>
                                        <Text style={styles.notifTime}>
                                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                        </Text>
                                    </View>
                                    <Text style={styles.notifPreview} numberOfLines={2}>
                                        {renderNotificationContent(item)}
                                    </Text>
                                </View>
                                {!item.is_read && <View style={styles.dot} />}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyNotif}>
                                <Bell size={48} color="#D1D5DB" />
                                <Text style={styles.emptyNotifText}>{t('profile.no_notifications_yet')}</Text>
                            </View>
                        }
                    />

                    {notifications.length > 0 && (
                        <TouchableOpacity
                            style={styles.clearAllButton}
                            onPress={handleMarkAllRead}
                        >
                            <Text style={styles.clearAllText}>{t('profile.mark_all_read')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>

            {/* Help Modal */}
            <Modal
                visible={showHelp}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowHelp(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowHelp(false)}
                >
                    <View style={styles.helpCard}>
                        <View style={styles.helpHeader}>
                            <HelpCircle size={32} color="#1E3A8A" />
                            <Text style={styles.helpTitle}>{t('profile.help')}</Text>
                        </View>

                        <Text style={styles.helpContent}>{t('profile.help_contact')}</Text>

                        <TouchableOpacity
                            style={styles.emailContainer}
                            onPress={() => handleCopyText(t('profile.help_email'))}
                        >
                            <View style={styles.emailContent}>
                                <Mail size={20} color="#1E3A8A" />
                                <Text style={styles.emailText}>{t('profile.help_email')}</Text>
                            </View>
                            <Copy size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.emailContainer, { marginTop: -16 }]}
                            onPress={() => handleCopyText(t('profile.help_email_2'))}
                        >
                            <View style={styles.emailContent}>
                                <Mail size={20} color="#1E3A8A" />
                                <Text style={styles.emailText}>{t('profile.help_email_2')}</Text>
                            </View>
                            <Copy size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.helpCloseBtn}
                            onPress={() => setShowHelp(false)}
                        >
                            <Text style={styles.helpCloseText}>{t('common.ok')}</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Follow List Modal */}
            {userId && (
                <FollowListModal
                    visible={followModalVisible}
                    onClose={() => setFollowModalVisible(false)}
                    userId={userId}
                    currentUserId={userId}
                    initialTab={followModalTab}
                    onFollowCountChange={(followersCount, followingCount) => {
                        // Update the profile stats in real-time
                        setProfile(prev => {
                            if (!prev) return prev;
                            return {
                                ...prev,
                                stats: {
                                    postsCount: prev.stats?.postsCount || 0,
                                    followersCount,
                                    followingCount,
                                    appreciationCount: prev.stats?.appreciationCount || 0,
                                },
                            };
                        });
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    content: {
        paddingBottom: 40,
    },
    divider: {
        height: 8,
        backgroundColor: '#F3F4F6',
        marginVertical: 16,
    },
    pageTabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        height: 48,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    pageTab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    pageTabLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pageTabIndicator: {
        position: 'absolute',
        bottom: 8,
        width: 16,
        height: 3,
        backgroundColor: '#1E3A8A',
        borderRadius: 2,
    },
    pageTabText: {
        fontSize: 15,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    pageTabTextActive: {
        color: '#111827',
        fontWeight: '700',
    },
    pageTabBadge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    pageTabBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    scrollContentPager: {
        paddingBottom: 40,
    },
    lazyPagePlaceholder: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    lazyPagePlaceholderText: {
        fontSize: 16,
        color: '#9CA3AF',
        fontWeight: '600',
    },
    blueHeader: {
        backgroundColor: '#1E3A8A',
        height: 160,
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    blueHeaderTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerPlaceholder: {
        backgroundColor: '#1E3A8A',
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingTop: 56,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    avatarCameraIcon: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    profileInfo: {
        flex: 1,
        marginLeft: 16,
    },
    profileName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        marginRight: 6,
    },
    profileNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    profileMajor: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    editButton: {
        padding: 8,
    },
    section: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    seeAllText: {
        fontSize: 14,
        color: '#6B7280',
    },
    countBadgeInline: {
        backgroundColor: '#EF4444',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 8,
    },
    countTextInline: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    notificationPreviewList: {
        gap: 12,
    },
    notifPreviewItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    notifUnread: {
        backgroundColor: '#EFF6FF',
        borderColor: '#DBEAFE',
    },
    notifPreviewIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    notifPreviewTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
    },
    notifPreviewContent: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 1,
    },
    emptyText: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
        paddingVertical: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 12,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1E3A8A',
    },
    statLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        backgroundColor: '#E5E7EB',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingLabel: {
        fontSize: 16,
        color: '#111827',
        marginLeft: 12,
    },
    settingHint: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    menuText: {
        flex: 1,
        fontSize: 16,
        color: '#374151',
        marginLeft: 12,
    },
    menuRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuAlertBadge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
        marginRight: 8,
    },
    menuAlertBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 16,
        marginTop: 24,
        padding: 16,
        backgroundColor: '#FEE2E2',
        borderRadius: 12,
    },
    signOutText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#EF4444',
        marginLeft: 8,
    },
    menuIconWrapper: {
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: '#fff',
    },
    countBadge: {
        backgroundColor: '#EF4444',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginRight: 8,
    },
    countText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    notificationsList: {
        padding: 16,
    },
    notificationItem: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    notificationUnread: {
        backgroundColor: '#F0F9FF',
        borderColor: '#BAE6FD',
        borderWidth: 1,
    },
    notifIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    notifContent: {
        flex: 1,
    },
    notifTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1F2937',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    notifPreview: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    notifTime: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#1E3A8A',
        marginLeft: 8,
    },
    emptyNotif: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyNotifText: {
        marginTop: 16,
        fontSize: 16,
        color: '#9CA3AF',
    },
    clearAllButton: {
        padding: 16,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        backgroundColor: '#fff',
    },
    clearAllText: {
        fontSize: 14,
        color: '#1E3A8A',
        fontWeight: '600',
    },
    langSwitcher: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
        marginTop: 12,
    },
    langBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    langBtnActive: {
        backgroundColor: '#1E3A8A',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    langBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6B7280',
    },
    langBtnTextActive: {
        color: '#fff',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    helpCard: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    helpHeader: {
        marginBottom: 24,
        alignItems: 'center',
    },
    helpTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1E293B',
        marginTop: 12,
    },
    helpContent: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    emailContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        padding: 16,
        borderRadius: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 32,
    },
    emailContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    emailText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1E3A8A',
        marginLeft: 12,
    },
    helpCloseBtn: {
        backgroundColor: '#1E3A8A',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 14,
        width: '100%',
        alignItems: 'center',
    },
    helpCloseText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

import { Image as ExpoImageLib } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Check, X as CloseIcon, Globe, Plus, Search } from 'lucide-react-native';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  DeviceEventEmitter,
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActionModal } from '../../components/campus/ActionModal';
import MasonryGrid from '../../components/campus/MasonryGrid';
import { MasonryPostCard } from '../../components/campus/MasonryPostCard';
import { Toast, ToastType } from '../../components/campus/Toast';
import { Skeleton } from '../../components/common/Skeleton';
import { ForumPostRow } from '../../components/forum/ForumPostRow';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { getCurrentUser } from '../../services/auth';
import { deletePost, fetchPosts, subscribeToPosts, togglePostLike } from '../../services/campus';
import { fetchForumPosts } from '../../services/forum';
import { ForumCategory, ForumPost, ForumSort, Post, PostCategory } from '../../types';
import { isRemoteImageUrl, normalizeRemoteImageUrl } from '../../utils/remoteImage';
import { changeLanguage } from '../i18n/i18n';

type MainTab = 'discover' | 'forum';
const DISCOVER_PREFETCH_LIMIT = 12;

export default function CampusScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { checkLogin } = useLoginPrompt();

  const CATEGORIES: { id: PostCategory; label: string }[] = [
    { id: 'All', label: t('campus.categories.all') },
    { id: 'Events', label: t('campus.categories.events') },
    { id: 'Reviews', label: t('campus.categories.reviews') },
    { id: 'Guides', label: t('campus.categories.guides') },
    { id: 'Lost & Found', label: t('campus.categories.lost_found') },
  ];

  const LANGUAGE_OPTIONS = [
    { key: 'zh-Hans', label: '简体中文 (SC)' },
    { key: 'zh-Hant', label: '繁體中文 (HK)' },
    { key: 'en', label: 'English (US)' },
  ];

  const [mainTab, setMainTab] = useState<MainTab>('discover');
  const pagerRef = useRef<ScrollView>(null);
  const SCREEN_W = Dimensions.get('window').width;
  // Tracks pager horizontal scroll position in real time (frame-by-frame)
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pillContainerW, setPillContainerW] = useState(140); // will be measured

  const scrollToTab = (tab: MainTab) => {
    const index = tab === 'discover' ? 0 : 1;
    pagerRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    setMainTab(tab);
  };

  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const newTab: MainTab = x > SCREEN_W / 2 ? 'forum' : 'discover';
    if (newTab !== mainTab) setMainTab(newTab);
  };
  const [activeCategory, setActiveCategory] = useState<PostCategory>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'latest' | 'top'>('latest');

  // Discover category/sort should feel immediate, so keep one in-memory list
  // and derive the visible result locally instead of refetching on every tap.
  const filteredPosts = useMemo(() => {
    const byCategory = activeCategory === 'All'
      ? posts
      : posts.filter(post => post.category === activeCategory);

    const copy = [...byCategory];
    if (sortOrder === 'latest') {
      copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      copy.sort((a, b) => b.likes - a.likes);
    }
    return copy;
  }, [posts, activeCategory, sortOrder]);

  // ── Forum state ─────────────────────────────────────────────────────
  const FORUM_TABS: { id: ForumCategory | 'all'; label: string }[] = [
    { id: 'all', label: t('forum.tabs.all') },
    { id: 'activity', label: t('forum.tabs.activity') },
    { id: 'guide', label: t('forum.tabs.guide') },
    { id: 'lost_found', label: t('forum.tabs.lost_found') },
  ];
  const [forumCategory, setForumCategory] = useState<ForumCategory | 'all'>('all');
  const [forumSort, setForumSort] = useState<ForumSort>('latest_reply');
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [forumLoading, setForumLoading] = useState(false);
  const [forumRefreshing, setForumRefreshing] = useState(false);

  // ── Sync status across views ──────────────────────────────────────
  useEffect(() => {
    const campusSub = DeviceEventEmitter.addListener('campus_post_updated', (data) => {
      if (data.deleted) {
        setPosts(prev => prev.filter(p => p.id !== data.id));
      } else {
        setPosts(prev => prev.map(p => p.id === data.id ? { ...p, ...data.updates } : p));
      }
    });
    const forumSub = DeviceEventEmitter.addListener('forum_post_updated', (data) => {
      if (data.deleted) {
        setForumPosts(prev => prev.filter(p => p.id !== data.id));
      } else {
        setForumPosts(prev => prev.map(p => p.id === data.id ? { ...p, ...data.updates } : p));
      }
    });
    const blockSub = DeviceEventEmitter.addListener('user_blocked', (data) => {
      if (data.userId) {
        setPosts(prev => prev.filter(p => p.authorId !== data.userId));
        setForumPosts(prev => prev.filter(p => p.authorId !== data.userId));
      }
    });
    return () => {
      campusSub.remove();
      forumSub.remove();
      blockSub.remove();
    };
  }, []);

  const loadForumPosts = async (isRefresh = false) => {
    try {
      // Show skeleton only on true first load (no existing data)
      if (!isRefresh && forumPosts.length === 0) setForumLoading(true);
      const user = await getCurrentUser();
      const data = await fetchForumPosts(forumCategory, forumSort, user?.uid);
      setForumPosts(data);
    } catch (e) {
      console.error('Forum load error:', e);
    } finally {
      setForumLoading(false);
      setForumRefreshing(false);
    }
  };

  // Load forum posts once on mount, and re-fetch when category/sort changes.
  // DO NOT include mainTab – swiping to the forum tab must NOT trigger a reload.
  useEffect(() => {
    loadForumPosts();
  }, [forumCategory, forumSort]);

  // ─── Skeletons ────────────────────────────────────────────────────────────
  const MasonrySkeleton = () => (
    <View style={styles.skeletonGrid}>
      {/* Left column skeletons */}
      <View style={{ flex: 1, gap: 10 }}>
        <Skeleton width="100%" height={180} borderRadius={16} />
        <Skeleton width="100%" height={120} borderRadius={16} />
        <Skeleton width="100%" height={200} borderRadius={16} />
      </View>
      {/* Right column skeletons, offset slightly */}
      <View style={{ flex: 1, gap: 10, marginTop: 20 }}>
        <Skeleton width="100%" height={130} borderRadius={16} />
        <Skeleton width="100%" height={190} borderRadius={16} />
        <Skeleton width="100%" height={110} borderRadius={16} />
      </View>
    </View>
  );

  // ─── Data loading ─────────────────────────────────────────────────────────
  const prefetchedCoverUrlsRef = useRef<Set<string>>(new Set());

  const loadPosts = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const user = await getCurrentUser();
      setCurrentUser(user);
      const data = await fetchPosts('All', user?.uid);
      setPosts(data);

      if (__DEV__) {
        return;
      }

      // Pre-warm only the first visible batch instead of the entire feed.
      let prefetchedCount = 0;
      for (const post of data) {
        if (prefetchedCount >= DISCOVER_PREFETCH_LIMIT) {
          break;
        }

        const imgs = post.images?.length ? post.images : post.imageUrl ? [post.imageUrl] : [];
        const cover = imgs
          .map(img => normalizeRemoteImageUrl(img))
          .find((img): img is string => !!img);

        if (!cover || prefetchedCoverUrlsRef.current.has(cover)) {
          continue;
        }

        prefetchedCoverUrlsRef.current.add(cover);
        prefetchedCount += 1;
        ExpoImageLib.prefetch(cover).catch(() => {
          prefetchedCoverUrlsRef.current.delete(cover);
        });
      }
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();

    const unsubscribe = subscribeToPosts(() => loadPosts(true));
    return () => unsubscribe();
  }, [loadPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPosts(true);
  }, [loadPosts]);

  const handlePostPress = useCallback(
    (postId: string) => {
      // Pass cover image URL so the detail page can render it immediately from cache
      const post = posts.find(p => p.id === postId);
      const imgs = post?.images?.length ? post.images : post?.imageUrl ? [post.imageUrl] : [];
      const cover = imgs.find(img => isRemoteImageUrl(img)) ?? '';
      const textOnly = !cover ? '1' : '0';
      router.push({
        pathname: '/campus/[id]' as any,
        params: { id: postId, coverImage: cover, isTextOnly: textOnly },
      });
    },
    [router, posts]
  );

  const handleCompose = useCallback(() => {
    if (!checkLogin(currentUser)) return;
    if (mainTab === 'forum') {
      router.push('/forum/compose');
    } else {
      router.push('/campus/compose');
    }
  }, [router, mainTab, currentUser, checkLogin]);

  const handleLike = useCallback(
    async (postId: string) => {
      if (!checkLogin(currentUser)) return;
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const wasLiked = post.isLiked;
      // Optimistic update
      setPosts(prev =>
        prev.map(p =>
          p.id === postId
            ? { ...p, isLiked: !wasLiked, likes: wasLiked ? p.likes - 1 : p.likes + 1 }
            : p
        )
      );

      try {
        await togglePostLike(postId, currentUser.uid);
      } catch (error) {
        console.error('Error liking post:', error);
        // Rollback on error
        setPosts(prev =>
          prev.map(p =>
            p.id === postId
              ? { ...p, isLiked: wasLiked, likes: wasLiked ? p.likes : Math.max(0, p.likes) }
              : p
          )
        );
      }
    },
    [currentUser, posts]
  );

  const handleDeletePost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    setDeleteModalVisible(true);
  }, []);

  const confirmDelete = async () => {
    if (!selectedPostId) return;
    try {
      await deletePost(selectedPostId);
      setToast({ visible: true, message: t('campus.modals.delete_success'), type: 'success' });
      setPosts(prev => prev.filter(p => p.id !== selectedPostId));
    } catch (error) {
      console.error('Error deleting post:', error);
      setToast({ visible: true, message: t('campus.modals.delete_error'), type: 'error' });
    } finally {
      setDeleteModalVisible(false);
      setSelectedPostId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.logo}>HKCampus</Text>

        {/* Discover / Forum tabs – animated sliding pill */}
        <View
          style={styles.tabPillContainer}
          onLayout={e => setPillContainerW(e.nativeEvent.layout.width)}
        >
          {/* Sliding background pill */}
          <Animated.View
            style={[
              styles.tabPillSlider,
              {
                transform: [{
                  translateX: scrollX.interpolate({
                    inputRange: [0, SCREEN_W],
                    outputRange: [0, pillContainerW / 2],   // exact measured half
                    extrapolate: 'clamp',
                  }),
                }],
              },
            ]}
          />
          <TouchableOpacity style={styles.tabPill} onPress={() => scrollToTab('discover')}>
            <Animated.Text
              style={[
                styles.tabPillText,
                {
                  color: scrollX.interpolate({
                    inputRange: [0, SCREEN_W],
                    outputRange: ['#fff', '#6B7280'],
                    extrapolate: 'clamp',
                  }),
                  fontWeight: '600',
                },
              ]}
            >
              {t('campus.tabs.discover')}
            </Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabPill} onPress={() => scrollToTab('forum')}>
            <Animated.Text
              style={[
                styles.tabPillText,
                {
                  color: scrollX.interpolate({
                    inputRange: [0, SCREEN_W],
                    outputRange: ['#6B7280', '#fff'],
                    extrapolate: 'clamp',
                  }),
                  fontWeight: '600',
                },
              ]}
            >
              {t('campus.tabs.forum')}
            </Animated.Text>
          </TouchableOpacity>
        </View>

        {/* Right actions */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/campus/search')}
          >
            <Search size={20} color="#1E3A8A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setLangModalVisible(true)}>
            <Globe size={20} color="#1E3A8A" />
          </TouchableOpacity>
        </View>
      </View>


      {/* ── Pager: swipe between Discover and Forum ── */}
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
        {/* ── Page 0: Discover ── */}
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {/* Category filter – always mounted, no layout shift */}
          <View style={styles.filterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterList}
            >
              {CATEGORIES.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.filterButton,
                    activeCategory === item.id && styles.filterButtonActive,
                  ]}
                  onPress={() => {
                    startTransition(() => {
                      setActiveCategory(item.id);
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.filterText,
                      activeCategory === item.id && styles.filterTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Sort strip */}
          <View style={styles.sortStrip}>
            <TouchableOpacity
              style={[styles.sortBtn, sortOrder === 'latest' && styles.sortBtnActive]}
              onPress={() => {
                startTransition(() => {
                  setSortOrder('latest');
                });
              }}
            >
              <Text style={[styles.sortBtnText, sortOrder === 'latest' && styles.sortBtnTextActive]}>
                {t('campus.sort.latest_post')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortOrder === 'top' && styles.sortBtnActive]}
              onPress={() => {
                startTransition(() => {
                  setSortOrder('top');
                });
              }}
            >
              <Text style={[styles.sortBtnText, sortOrder === 'top' && styles.sortBtnTextActive]}>
                {t('campus.sort.most_liked')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Discover content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#1E3A8A"
              />
            }
          >
            {loading ? (
              <MasonrySkeleton />
            ) : posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t('campus.empty.no_posts')}</Text>
                <Text style={styles.emptySubtext}>{t('campus.empty.be_first')}</Text>
              </View>
            ) : (
              <View>
                <MasonryGrid
                  data={currentUser ? filteredPosts : filteredPosts.slice(0, 4)}
                  columnGap={8}
                  columnPadding={12}
                  keyExtractor={(post: Post) => post.id}
                    renderItem={(post: Post, index: number) => (
                      <MasonryPostCard
                        key={post.id}
                        post={post}
                        onPress={() => handlePostPress(post.id)}
                        onLike={() => handleLike(post.id)}
                        currentUserId={currentUser?.uid}
                        onAuthorPress={(authorId) => {
                          if (!post.isAnonymous) {
                            router.push({ pathname: '/profile/[id]' as any, params: { id: authorId } });
                          }
                        }}
                      />
                    )}
                />
                {!currentUser && filteredPosts.length > 4 && (
                  <View style={styles.guestFooter}>
                    <Text style={styles.guestFooterText}>{t('campus.guest_more_posts', 'Log in to discover more updates')}</Text>
                    <TouchableOpacity style={styles.guestFooterButton} onPress={() => checkLogin(currentUser)}>
                      <Text style={styles.guestFooterButtonText}>{t('auth.login_title', 'Log In / Sign Up')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>

        {/* ── Page 1: Forum ── */}
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {/* Category tabs */}
          <View style={styles.forumTabsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FORUM_TABS.map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.forumTab}
                  onPress={() => setForumCategory(tab.id)}
                >
                  <Text style={[
                    styles.forumTabText,
                    forumCategory === tab.id && styles.forumTabTextActive,
                  ]}>
                    {tab.label}
                  </Text>
                  {forumCategory === tab.id && <View style={styles.forumTabUnderline} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Sort toggle bar - on second row */}
          <View style={styles.forumSortBar}>
            <TouchableOpacity
              onPress={() => setForumSort('latest_reply')}
              style={[styles.forumSortBtn, forumSort === 'latest_reply' && styles.forumSortBtnActive]}
            >
              <Text style={[styles.forumSortText, forumSort === 'latest_reply' && styles.forumSortTextActive]}>
                {t('forum.sort.latest_reply')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setForumSort('latest_post')}
              style={[styles.forumSortBtn, forumSort === 'latest_post' && styles.forumSortBtnActive]}
            >
              <Text style={[styles.forumSortText, forumSort === 'latest_post' && styles.forumSortTextActive]}>
                {t('forum.sort.latest_post')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Post list */}
          {forumLoading ? (
            <View style={styles.forumSkeleton}>
              {[1, 2, 3, 4, 5].map(i => (
                <View key={i} style={styles.forumSkeletonRow}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '80%', height: 20, marginTop: 6 }]} />
                  <View style={[styles.skeletonLine, { width: '50%', height: 14, marginTop: 8 }]} />
                </View>
              ))}
            </View>
          ) : (
            <FlatList
              data={forumPosts}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <ForumPostRow
                  post={item}
                  onPress={() => router.push(`/forum/${item.id}` as any)}
                  onAuthorPress={(authorId) => {
                    if (authorId === currentUser?.uid) return;
                    router.push({ pathname: '/profile/[id]' as any, params: { id: authorId } });
                  }}
                />
              )}
              refreshControl={
                <RefreshControl
                  refreshing={forumRefreshing}
                  onRefresh={() => { setForumRefreshing(true); loadForumPosts(true); }}
                  tintColor="#1E3A8A"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{t('forum.empty.title')}</Text>
                  <Text style={styles.emptySubtext}>{t('forum.empty.subtitle')}</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 120 }}
            />
          )}
        </View>
      </Animated.ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity testID="new-post-fab" style={styles.fab} onPress={handleCompose} activeOpacity={0.85}>
        <LinearGradient
          colors={['#3B82F6', '#1E3A8A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Plus size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Modals ── */}
      <ActionModal
        visible={deleteModalVisible}
        title={t('campus.modals.delete_title')}
        message={t('campus.modals.delete_msg')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        confirmText={t('campus.modals.delete_confirm')}
        cancelText={t('common.cancel')}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Language switcher modal */}
      <Modal
        visible={langModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLangModalVisible(false)}>
          <View style={styles.langModalContent}>
            <View style={styles.langModalHeader}>
              <Text style={styles.langModalTitle}>{t('profile.language')}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <CloseIcon size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.langList}>
              {LANGUAGE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.langOption}
                  onPress={async () => {
                    await changeLanguage(opt.key);
                    setLangModalVisible(false);
                  }}
                >
                  <View style={styles.langOptionLeft}>
                    <Globe
                      size={20}
                      color={i18n.language === opt.key ? '#1E3A8A' : '#9CA3AF'}
                    />
                    <Text
                      style={[
                        styles.langOptionText,
                        i18n.language === opt.key && styles.langOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {i18n.language === opt.key && (
                    <Check size={20} color="#1E3A8A" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
  },
  logo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A8A',
    letterSpacing: -0.5,
  },
  tabPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F8',
    borderRadius: 20,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  tabPillSlider: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    width: '50%',
    borderRadius: 17,
    backgroundColor: '#1E3A8A',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 17,
  },
  tabPillActive: {
    backgroundColor: '#1E3A8A',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Category filter ───────────────────────────────────────────────────────
  filterContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
  },
  filterList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F4F6FB',
  },
  filterButtonActive: {
    backgroundColor: '#1E3A8A',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTextActive: {
    color: '#fff',
  },

  // ── Sort strip ────────────────────────────────────────────────────────────
  sortStrip: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F4F6FB',
  },
  sortBtnActive: {
    backgroundColor: '#EEF2FF',
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  sortBtnTextActive: {
    color: '#1E3A8A',
  },

  // ── Feed ──────────────────────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  guestFooter: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  guestFooterText: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 16,
  },
  guestFooterButton: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  guestFooterButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ── Skeletons ────────────────────────────────────────────────────────────
  skeletonGrid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },

  // ── Forum placeholder ─────────────────────────────────────────────────────
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  comingSoonEmoji: {
    fontSize: 48,
  },
  comingSoonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
  },
  comingSoonSub: {
    fontSize: 14,
    color: '#9CA3AF',
  },

  // ── Forum ─────────────────────────────────────────────────────────────
  forumContainer: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  forumTabsRow: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
    paddingLeft: 4,
  },
  forumTab: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  forumTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  forumTabTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  forumTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 2.5,
    backgroundColor: '#1E3A8A',
    borderRadius: 2,
  },
  forumSortBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
  },
  forumSortToggle: {
    flexDirection: 'row',
    marginLeft: 'auto',
    paddingRight: 8,
    gap: 2,
  },
  forumSortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  forumSortBtnActive: {
    backgroundColor: '#EEF2FF',
  },
  forumSortText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  forumSortTextActive: {
    color: '#1E3A8A',
  },
  forumSkeleton: {
    padding: 16,
    gap: 4,
    backgroundColor: '#fff',
  },
  forumSkeletonRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F8',
  },
  skeletonLine: {
    height: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    width: '100%',
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Language modal ────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  langModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  langModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  langModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  langList: {
    gap: 12,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
  },
  langOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langOptionText: {
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
  langOptionTextActive: {
    color: '#1E3A8A',
    fontWeight: '700',
  },
});

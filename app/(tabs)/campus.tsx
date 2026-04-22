import { Image as ExpoImageLib } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Check, X as CloseIcon, Globe, Plus, Search, Calendar, BookOpen, ShoppingBag, Users, Heart, MessageCircle } from 'lucide-react-native';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
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
import { useUgcEntryActions } from '../../hooks/useUgcEntryActions';
import { getCurrentUser } from '../../services/auth';
import { deletePost, fetchPosts, POSTS_PAGE_SIZE, subscribeToPosts, togglePostLike } from '../../services/campus';
import { addHiddenPostId, filterHiddenPosts, getHiddenPostIds } from '../../services/feedPreferences';
import { fetchForumPosts, FORUM_PAGE_SIZE } from '../../services/forum';
import { ForumCategory, ForumPost, ForumSort, Post, PostCategory } from '../../types';
import { isRemoteImageUrl, normalizeRemoteImageUrl } from '../../utils/remoteImage';
import { changeLanguage } from '../i18n/i18n';

type MainTab = 'discover' | 'forum';
const SCREEN_W = Dimensions.get('window').width;

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

  const FORUM_SECTIONS = [
    { id: 'general', label: t('forum.sections.general') || 'General', icon: MessageCircle, color: '#6366F1' },
    { id: 'activity', label: t('forum.sections.activity') || 'Campus Activities', icon: Calendar, color: '#3B82F6' },
    { id: 'guide', label: t('forum.sections.guide') || 'Newbie Guide', icon: BookOpen, color: '#10B981' },
    { id: 'lost_found', label: t('forum.sections.lost_found') || 'Lost & Found', icon: Search, color: '#F59E00' },
    { id: 'marketplace', label: t('forum.sections.marketplace') || 'Marketplace', icon: ShoppingBag, color: '#EC4899' },
    { id: 'teaming', label: t('forum.sections.teaming') || 'Team Up', icon: Users, color: '#8B5CF6' },
    { id: 'confession', label: t('forum.sections.confession') || 'Confession', icon: Heart, color: '#EF4444' },
  ];

  const LANGUAGE_OPTIONS = [
    { key: 'zh-Hans', label: '简体中文 (SC)' },
    { key: 'zh-Hant', label: '繁體中文 (HK)' },
    { key: 'en', label: 'English (US)' },
  ];

  const [mainTab, setMainTab] = useState<MainTab>('discover');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const ugcActions = useUgcEntryActions({
    currentUserId: currentUser?.uid,
    ensureLoggedIn: () => !!checkLogin(currentUser),
    onBlockedUser: (id) => { setPosts(p => p.filter(x => x.authorId !== id)); setForumPosts(p => p.filter(x => x.authorId !== id)); },
    onHideTarget: async (t) => {
      await addHiddenPostId(t.targetId);
      if (t.targetType === 'forum_post') setForumPosts(p => p.filter(x => x.id !== t.targetId));
      else setPosts(p => p.filter(x => x.id !== t.targetId));
    },
  });

  const pagerRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pillContainerW, setPillContainerW] = useState(140);
  const [activeCategory, setActiveCategory] = useState<PostCategory>('All');
  const [posts, setPosts] = useState<Post[]>([]);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forumRefreshing, setForumRefreshing] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreForum, setLoadingMoreForum] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [forumPage, setForumPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreForum, setHasMoreForum] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({ visible: false, message: '', type: 'success' });
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'latest' | 'top'>('latest');

  const scrollToTab = (tab: MainTab) => {
    pagerRef.current?.scrollTo({ x: tab === 'discover' ? 0 : SCREEN_W, animated: true });
    setMainTab(tab);
  };

  const onPagerScroll = (e: any) => {
    const newTab: MainTab = e.nativeEvent.contentOffset.x > SCREEN_W / 2 ? 'forum' : 'discover';
    if (newTab !== mainTab) setMainTab(newTab);
  };

  const loadPosts = useCallback(async (isSilent = false, p = 0) => {
    try {
      if (!isSilent) setLoading(true);
      const user = await getCurrentUser();
      setCurrentUser(user);
      const data = await fetchPosts('All', user?.uid, p, POSTS_PAGE_SIZE);
      const hiddenIds = await getHiddenPostIds();
      const filtered = filterHiddenPosts(data, hiddenIds);
      if (p === 0) setPosts(filtered);
      else setPosts(prev => [...prev, ...filtered.filter(n => !prev.find(x => x.id === n.id))]);
      setPostsPage(p);
      setHasMorePosts(data.length >= POSTS_PAGE_SIZE);
    } catch (e) { console.error(e); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadForumPosts = async (isRefresh = false, p = 0) => {
    try {
      if (isRefresh) setForumRefreshing(true);
      const user = await getCurrentUser();
      const data = await fetchForumPosts('all', 'recommended', user?.uid, p, FORUM_PAGE_SIZE);
      const hiddenIds = await getHiddenPostIds();
      const filtered = filterHiddenPosts(data, hiddenIds);
      if (p === 0) setForumPosts(filtered);
      else setForumPosts(prev => [...prev, ...filtered.filter(n => !prev.find(x => x.id === n.id))]);
      setForumPage(p);
      setHasMoreForum(data.length >= FORUM_PAGE_SIZE);
    } catch (e) { console.error(e); } finally { setForumRefreshing(false); }
  };

  useEffect(() => { loadPosts(); loadForumPosts(); }, []);

  const filteredPosts = useMemo(() => {
    const res = activeCategory === 'All' ? posts : posts.filter(p => p.category === activeCategory);
    return [...res].sort((a, b) => sortOrder === 'latest' ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : b.likes - a.likes);
  }, [posts, activeCategory, sortOrder]);

  const handlePostPress = useCallback((postId: string) => {
    const post = posts.find(p => p.id === postId);
    const imgs = post?.images?.length ? post.images : post?.imageUrl ? [post.imageUrl] : [];
    const cover = imgs.find(img => isRemoteImageUrl(img)) ?? '';
    const textOnly = !cover ? '1' : '0';
    router.push({ pathname: '/campus/[id]' as any, params: { id: postId, coverImage: cover, isTextOnly: textOnly } });
  }, [router, posts]);

  const handleCompose = useCallback(() => {
    if (!checkLogin(currentUser)) return;
    if (mainTab === 'forum') router.push('/forum/compose');
    else router.push('/campus/compose');
  }, [router, mainTab, currentUser, checkLogin]);

  const handleLike = useCallback(async (postId: string) => {
    if (!checkLogin(currentUser)) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const wasLiked = post.isLiked;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: !wasLiked, likes: wasLiked ? p.likes - 1 : p.likes + 1 } : p));
    try { await togglePostLike(postId, currentUser.uid); } catch (e) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: wasLiked, likes: wasLiked ? p.likes : Math.max(0, p.likes) } : p));
    }
  }, [currentUser, posts]);

  const handleDiscoverCardLongPress = useCallback((post: Post) => {
    ugcActions.openActions({ id: post.id, targetId: post.id, targetType: 'post', content: post.content, authorId: post.authorId, authorName: post.authorName, isAnonymous: post.isAnonymous });
  }, [ugcActions]);

  const confirmDelete = async () => {
    if (!selectedPostId) return;
    try {
      await deletePost(selectedPostId);
      setToast({ visible: true, message: t('campus.modals.delete_success'), type: 'success' });
      setPosts(p => p.filter(x => x.id !== selectedPostId));
    } catch (e) { setToast({ visible: true, message: t('campus.modals.delete_error'), type: 'error' }); } finally { setDeleteModalVisible(false); setSelectedPostId(null); }
  };

  return (
    <View style={styles.container}>
      {/* FIXED HEADER - NO ABSOLUTE POSITIONING TO ELIMINATE GAPS */}
      <View style={styles.header}>
        <Text style={styles.logo}>HKCampus</Text>
        <View style={styles.tabPillContainer} onLayout={e => setPillContainerW(e.nativeEvent.layout.width)}>
          <Animated.View style={[styles.tabPillSlider, { transform: [{ translateX: scrollX.interpolate({ inputRange: [0, SCREEN_W], outputRange: [0, pillContainerW / 2], extrapolate: 'clamp' }) }] }]} />
          <TouchableOpacity style={styles.tabPill} onPress={() => scrollToTab('discover')}>
            <Animated.Text style={[styles.tabPillText, { color: scrollX.interpolate({ inputRange: [0, SCREEN_W], outputRange: ['#fff', '#6B7280'], extrapolate: 'clamp' }), fontWeight: '600' }]}>{t('campus.tabs.discover')}</Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabPill} onPress={() => scrollToTab('forum')}>
            <Animated.Text style={[styles.tabPillText, { color: scrollX.interpolate({ inputRange: [0, SCREEN_W], outputRange: ['#6B7280', '#fff'], extrapolate: 'clamp' }), fontWeight: '600' }]}>{t('campus.tabs.forum')}</Animated.Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/campus/search')}><Search size={20} color="#1E3A8A" /></TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setLangModalVisible(true)}><Globe size={20} color="#1E3A8A" /></TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        ref={pagerRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={onPagerScroll}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts(true, 0)} tintColor="#1E3A8A" />}>
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>
                {CATEGORIES.map(item => (
                  <TouchableOpacity key={item.id} style={[styles.filterButton, activeCategory === item.id && styles.filterButtonActive]} onPress={() => setActiveCategory(item.id)}>
                    <Text style={[styles.filterText, activeCategory === item.id && styles.filterTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.sortStrip}>
              {['latest', 'top'].map(s => (
                <TouchableOpacity key={s} style={[styles.sortBtn, sortOrder === s && styles.sortBtnActive]} onPress={() => setSortOrder(s as any)}>
                  <Text style={[styles.sortBtnText, sortOrder === s && styles.sortBtnTextActive]}>{t(`campus.sort.${s === 'latest' ? 'latest_post' : 'most_liked'}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? <View style={{ padding: 12 }}><ActivityIndicator color="#1E3A8A" /></View> : (
              <MasonryGrid
                data={currentUser ? filteredPosts : filteredPosts.slice(0, 4)}
                columnGap={8}
                columnPadding={12}
                keyExtractor={(p) => p.id}
                renderItem={(p) => (
                  <MasonryPostCard
                    key={p.id}
                    post={p}
                    onPress={() => handlePostPress(p.id)}
                    onLike={() => handleLike(p.id)}
                    onLongPress={() => handleDiscoverCardLongPress(p)}
                    currentUserId={currentUser?.uid}
                    onAuthorPress={(authorId) => { if (!p.isAnonymous) router.push({ pathname: '/profile/[id]', params: { id: authorId } }); }}
                  />
                )}
              />
            )}
          </ScrollView>
        </View>

        <View style={{ width: SCREEN_W, flex: 1 }}>
          <FlatList
            data={forumPosts}
            keyExtractor={item => item.id}
            ListHeaderComponent={() => (
              <View style={styles.forumSectionsContainer}>
                {FORUM_SECTIONS.map(section => (
                  <TouchableOpacity key={section.id} style={styles.forumSectionItem} onPress={() => router.push({ pathname: '/forum/category/[id]', params: { id: section.id, title: section.label } })}>
                    <View style={[styles.forumSectionIcon, { backgroundColor: section.color + '10' }]}><section.icon size={26} color={section.color} /></View>
                    <Text style={styles.forumSectionLabel}>{section.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            renderItem={({ item }) => <ForumPostRow post={item} onPress={() => router.push(`/forum/${item.id}`)} onAuthorPress={(id) => router.push({ pathname: '/profile/[id]', params: { id } })} />}
            refreshControl={<RefreshControl refreshing={forumRefreshing} onRefresh={() => loadForumPosts(true, 0)} tintColor="#1E3A8A" />}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        </View>
      </Animated.ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleCompose} activeOpacity={0.85}><LinearGradient colors={['#3B82F6', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}><Plus size={28} color="#fff" /></LinearGradient></TouchableOpacity>
      <ActionModal visible={deleteModalVisible} title={t('campus.modals.delete_title')} message={t('campus.modals.delete_msg')} onConfirm={confirmDelete} onCancel={() => setDeleteModalVisible(false)} />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast(p => ({ ...p, visible: false }))} />

      <Modal visible={langModalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setLangModalVisible(false)}>
          <View style={styles.langModalContent}>
            <View style={styles.langModalHeader}><Text style={styles.langModalTitle}>{t('common.change_language')}</Text></View>
            <View style={styles.langList}>{LANGUAGE_OPTIONS.map(opt => (<TouchableOpacity key={opt.key} style={styles.langOption} onPress={async () => { await changeLanguage(opt.key); setLangModalVisible(false); }}><Text style={[styles.langOptionText, i18n.language === opt.key && styles.langOptionTextActive]}>{opt.label}</Text></TouchableOpacity>))}</View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F0F2F8' },
  logo: { fontSize: 20, fontWeight: '800', color: '#1E3A8A', letterSpacing: -0.5 },
  tabPillContainer: { flexDirection: 'row', backgroundColor: '#F0F2F8', borderRadius: 20, padding: 3, position: 'relative', overflow: 'hidden' },
  tabPillSlider: { position: 'absolute', top: 3, left: 3, bottom: 3, width: '50%', borderRadius: 17, backgroundColor: '#1E3A8A' },
  tabPill: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 17 },
  tabPillText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0F2F8', alignItems: 'center', justifyContent: 'center' },
  filterContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F2F8' },
  filterList: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterButton: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F4F6FB' },
  filterButtonActive: { backgroundColor: '#1E3A8A' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  filterTextActive: { color: '#fff' },
  sortStrip: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F2F8' },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F4F6FB' },
  sortBtnActive: { backgroundColor: '#EEF2FF' },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  sortBtnTextActive: { color: '#1E3A8A' },
  scrollContent: { backgroundColor: '#fff' },
  forumSectionsContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8, justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 14 },
  forumSectionItem: { width: (Dimensions.get('window').width - 48) / 3, alignItems: 'center', marginBottom: 16 },
  forumSectionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  forumSectionLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },
  fab: { position: 'absolute', bottom: 100, right: 20, width: 60, height: 60, borderRadius: 30, overflow: 'hidden' },
  fabGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  langModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  langModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  langModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  langList: { gap: 12 },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F9FAFB', borderRadius: 16 },
  langOptionText: { fontSize: 16, color: '#4B5563', fontWeight: '500' },
  langOptionTextActive: { color: '#1E3A8A', fontWeight: '700' },
});

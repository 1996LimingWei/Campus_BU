import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    DeviceEventEmitter,
    FlatList,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { ForumPostRow } from '../../../components/forum/ForumPostRow';
import { getCurrentUser } from '../../../services/auth';
import { fetchForumPosts, FORUM_PAGE_SIZE } from '../../../services/forum';
import { ForumCategory, ForumPost, ForumSort } from '../../../types';
import { filterHiddenPosts, getHiddenPostIds } from '../../../services/feedPreferences';
import { LinearGradient } from 'expo-linear-gradient';
import * as LucideIcons from 'lucide-react-native';

const CATEGORY_METADATA: Record<string, {
    icon: any;
    color: string;
}> = {
    general: {
        icon: LucideIcons.Globe,
        color: '#1E3A8A',
    },
    activity: {
        icon: LucideIcons.Calendar,
        color: '#3B82F6',
    },
    guide: {
        icon: LucideIcons.BookOpen,
        color: '#10B981',
    },
    lost_found: {
        icon: LucideIcons.Search,
        color: '#F59E00',
    },
    marketplace: {
        icon: LucideIcons.ShoppingBag,
        color: '#EC4899',
    },
    teaming: {
        icon: LucideIcons.Users,
        color: '#8B5CF6',
    },
    confession: {
        icon: LucideIcons.Heart,
        color: '#EF4444',
    },
    help: {
        icon: LucideIcons.HelpCircle,
        color: '#F59E00',
    }
};

export default function CategoryForumScreen() {
    const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
    const router = useRouter();
    const { t } = useTranslation();

    const [posts, setPosts] = useState<ForumPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activeSort, setActiveSort] = useState<ForumSort>('recommended');

    const loadData = async (isRefresh = false, pageToLoad = 0) => {
        try {
            if (!isRefresh && posts.length === 0) setLoading(true);
            const user = await getCurrentUser();
            setCurrentUser(user);
            
            const category = id as ForumCategory;
            const data = await fetchForumPosts(category, activeSort, user?.uid, pageToLoad, FORUM_PAGE_SIZE);
            const hiddenPostIds = await getHiddenPostIds();
            const filteredData = filterHiddenPosts(data, hiddenPostIds);

            if (pageToLoad === 0) {
                setPosts(filteredData);
            } else {
                setPosts(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const newPosts = filteredData.filter(p => !existingIds.has(p.id));
                    return [...prev, ...newPosts];
                });
            }
            setPage(pageToLoad);
            setHasMore(data.length >= FORUM_PAGE_SIZE);
        } catch (error) {
            console.error('Error loading category posts:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        setPosts([]);
        loadData(true, 0);
    }, [id, activeSort]);

    // Handle updates from detail screen
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('forum_post_updated', (data) => {
            if (data.deleted) {
                setPosts(prev => prev.filter(p => p.id !== data.id));
            } else {
                setPosts(prev => prev.map(p => p.id === data.id ? { ...p, ...data.updates } : p));
            }
        });
        return () => sub.remove();
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData(true, 0);
    }, [id]);

    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        loadData(true, page + 1).finally(() => setLoadingMore(false));
    }, [page, hasMore, loadingMore, id]);

    const meta = CATEGORY_METADATA[id] || CATEGORY_METADATA.general;
    const categoryDesc = t(`forum.category_desc.${id}`, { defaultValue: t('forum.category_desc.default') });

    const CategoryHeader = () => (
        <View style={styles.richHeaderContainer}>
            <LinearGradient
                colors={[meta.color, meta.color + 'CC', '#F4F6FB']}
                style={styles.gradientHeader}
            >
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <LucideIcons.ChevronLeft size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.categoryIdentity}>
                    <View style={[styles.categoryIconBig, { backgroundColor: '#fff' }]}>
                        <meta.icon size={42} color={meta.color} />
                    </View>
                    <View style={styles.categoryInfoText}>
                        <Text style={styles.categoryTitleBig}>{title || t(`forum.sections.${id}`)}</Text>
                    </View>
                </View>
            </LinearGradient>

            <View style={styles.introCard}>
                <View style={styles.introHeader}>
                    <LucideIcons.Info size={16} color="#4B5563" />
                    <Text style={styles.introTitle}>{t('forum.category_ui.intro_title')}</Text>
                </View>
                <Text style={styles.introText}>{categoryDesc}</Text>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={activeSort === 'recommended' ? styles.activeTab : styles.inactiveTab}
                    onPress={() => setActiveSort('recommended')}
                >
                    <Text style={activeSort === 'recommended' ? styles.activeTabText : styles.inactiveTabText}>
                        {t('forum.category_ui.tab_all')}
                    </Text>
                    {activeSort === 'recommended' && <View style={[styles.tabIndicator, { backgroundColor: meta.color }]} />}
                </TouchableOpacity>

                <TouchableOpacity 
                    style={activeSort === 'latest_post' ? styles.activeTab : styles.inactiveTab}
                    onPress={() => setActiveSort('latest_post')}
                >
                    <Text style={activeSort === 'latest_post' ? styles.activeTabText : styles.inactiveTabText}>
                        {t('forum.category_ui.tab_latest')}
                    </Text>
                    {activeSort === 'latest_post' && <View style={[styles.tabIndicator, { backgroundColor: meta.color }]} />}
                </TouchableOpacity>

                <TouchableOpacity 
                    style={activeSort === 'hot' ? styles.activeTab : styles.inactiveTab}
                    onPress={() => setActiveSort('hot')}
                >
                    <Text style={activeSort === 'hot' ? styles.activeTabText : styles.inactiveTabText}>
                        {t('forum.category_ui.tab_hot')}
                    </Text>
                    {activeSort === 'hot' && <View style={[styles.tabIndicator, { backgroundColor: meta.color }]} />}
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={item => item.id}
                    ListHeaderComponent={CategoryHeader}
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
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={meta.color}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <LucideIcons.MessageSquare size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>{t('forum.empty.title')}</Text>
                            <TouchableOpacity 
                                style={[styles.emptyActionBtn, { borderColor: meta.color }]}
                                onPress={() => router.push({ 
                                    pathname: '/forum/compose', 
                                    params: { category: id } 
                                })}
                            >
                                <Text style={[styles.emptyActionText, { color: meta.color }]}>{t('forum.category_ui.be_first_post')}</Text>
                            </TouchableOpacity>
                        </View>
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}

            {/* Floating Action Button */}
            <TouchableOpacity 
                style={styles.fab}
                activeOpacity={0.85}
                onPress={() => router.push({ 
                    pathname: '/forum/compose', 
                    params: { category: id } 
                })}
            >
                <LinearGradient
                    colors={['#3B82F6', '#1E3A8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.fabGradient}
                >
                    <Plus size={28} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F4F6FB',
    },
    richHeaderContainer: {
        backgroundColor: '#F4F6FB',
    },
    gradientHeader: {
        paddingTop: 56,
        paddingBottom: 24,
        paddingHorizontal: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerRightActions: {
        flexDirection: 'row',
        gap: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -10,
    },
    headerIconBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryIdentity: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    categoryIconBig: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    categoryInfoText: {
        flex: 1,
        marginLeft: 16,
    },
    categoryTitleBig: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -0.5,
    },
    categoryStatsText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 4,
        fontWeight: '500',
    },
    joinBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    joinBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    introCard: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: -16,
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    introHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 6,
    },
    introTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4B5563',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    introText: {
        fontSize: 14,
        lineHeight: 20,
        color: '#374151',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 8,
        backgroundColor: '#F4F6FB',
    },
    activeTab: {
        marginRight: 24,
        paddingBottom: 8,
        position: 'relative',
    },
    activeTabText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#111827',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        borderRadius: 2,
    },
    inactiveTab: {
        marginRight: 24,
        paddingBottom: 8,
    },
    inactiveTabText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingBottom: 60,
    },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 120,
        backgroundColor: '#fff',
        flex: 1,
        minHeight: 600,
        borderRadius: 24,
        marginHorizontal: 16,
        marginTop: 16,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    emptyActionBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1.5,
        marginTop: 8,
    },
    emptyActionText: {
        fontSize: 14,
        fontWeight: '700',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    fabGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

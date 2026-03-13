import { useRouter } from 'expo-router';
import { ArrowLeft, X as CloseIcon, Search as SearchIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MasonryGrid from '../../components/campus/MasonryGrid';
import { MasonryPostCard } from '../../components/campus/MasonryPostCard';
import { ForumPostRow } from '../../components/forum/ForumPostRow';
import { getCurrentUser } from '../../services/auth';
import { searchPosts, togglePostLike } from '../../services/campus';
import { searchForumPosts } from '../../services/forum';
import { ForumPost, Post } from '../../types';

type SearchTab = 'discover' | 'forum';

export default function CampusSearchScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<SearchTab>('discover');
    const [loading, setLoading] = useState(false);

    const [campusPosts, setCampusPosts] = useState<Post[]>([]);
    const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        getCurrentUser().then(user => setCurrentUser(user));
    }, []);

    const performSearch = async () => {
        if (!query.trim()) return;

        Keyboard.dismiss();
        setLoading(true);
        setHasSearched(true);

        try {
            if (activeTab === 'discover') {
                const results = await searchPosts(query, currentUser?.uid);
                setCampusPosts(results);
            } else {
                const results = await searchForumPosts(query, currentUser?.uid);
                setForumPosts(results);
            }
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto trigger search when tab changes if query exists and already searched
    useEffect(() => {
        if (hasSearched && query.trim()) {
            performSearch();
        }
    }, [activeTab]);

    const handleClear = () => {
        setQuery('');
        setCampusPosts([]);
        setForumPosts([]);
        setHasSearched(false);
    };

    const handlePostPress = useCallback(
        (postId: string) => {
            const post = campusPosts.find(p => p.id === postId);
            const imgs = post?.images?.length ? post.images : post?.imageUrl ? [post.imageUrl] : [];
            const cover = imgs.find(img => !!img) ?? '';
            const textOnly = !cover ? '1' : '0';
            router.push({
                pathname: '/campus/[id]' as any,
                params: { id: postId, coverImage: cover, isTextOnly: textOnly },
            });
        },
        [router, campusPosts]
    );

    const handleLike = useCallback(
        async (postId: string) => {
            if (!currentUser) return;
            const postIndex = campusPosts.findIndex(p => p.id === postId);
            if (postIndex === -1) return;

            const post = campusPosts[postIndex];
            const originalLiked = post.isLiked;
            const originalLikes = post.likes;

            setCampusPosts(prev => {
                const next = [...prev];
                next[postIndex] = {
                    ...post,
                    isLiked: !originalLiked,
                    likes: originalLiked ? originalLikes - 1 : originalLikes + 1,
                };
                return next;
            });

            try {
                await togglePostLike(postId, currentUser.uid);
            } catch (error) {
                // Revert
                setCampusPosts(prev => {
                    const next = [...prev];
                    next[postIndex] = post;
                    return next;
                });
            }
        },
        [campusPosts, currentUser]
    );

    const renderEmptyState = () => {
        if (loading) return null;
        if (!hasSearched) return null;

        return (
            <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>{t('campus.search.no_results', '未找到相关结果')}</Text>
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header / Search Bar */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={24} color="#111827" />
                </TouchableOpacity>
                <View style={styles.searchBar}>
                    <SearchIcon size={18} color="#6B7280" />
                    <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('campus.search.placeholder', '搜索内容、作者...')}
                        placeholderTextColor="#9CA3AF"
                        returnKeyType="search"
                        onSubmitEditing={performSearch}
                        autoFocus
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                            <CloseIcon size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'discover' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('discover')}
                >
                    <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>
                        {t('campus.search.tabs.discover', '发现')}
                    </Text>
                    {activeTab === 'discover' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'forum' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('forum')}
                >
                    <Text style={[styles.tabText, activeTab === 'forum' && styles.tabTextActive]}>
                        {t('campus.search.tabs.forum', '论坛')}
                    </Text>
                    {activeTab === 'forum' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.contentContainer}>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#1E3A8A" />
                    </View>
                ) : activeTab === 'discover' ? (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {campusPosts.length === 0 ? (
                            renderEmptyState()
                        ) : (
                            <MasonryGrid
                                data={campusPosts}
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
                                            if (authorId === currentUser?.uid) return;
                                            router.push(`/profile/${authorId}` as any);
                                        }}
                                    />
                                )}
                            />
                        )}
                    </ScrollView>
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
                                    router.push(`/profile/${authorId}` as any);
                                }}
                            />
                        )}
                        ListEmptyComponent={renderEmptyState()}
                        contentContainerStyle={{ paddingBottom: 120 }}
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#FFFFFF',
    },
    backButton: {
        marginRight: 12,
        padding: 4,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 40,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        color: '#111827',
        height: '100%',
    },
    clearButton: {
        padding: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingHorizontal: 16,
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        position: 'relative',
    },
    tabButtonActive: {},
    tabText: {
        fontSize: 15,
        color: '#6B7280',
        fontWeight: '500',
    },
    tabTextActive: {
        color: '#1E3A8A',
        fontWeight: 'bold',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        width: 30,
        height: 3,
        backgroundColor: '#1E3A8A',
        borderRadius: 1.5,
    },
    contentContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyStateText: {
        fontSize: 15,
        color: '#6B7280',
    },
});

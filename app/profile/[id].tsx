import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FollowListModal } from '../../components/profile/FollowListModal';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { ProfilePostFeed } from '../../components/profile/ProfilePostFeed';
import { getCurrentUser, getUserProfile } from '../../services/auth';
import { fetchPostsByAuthor, togglePostLike } from '../../services/campus';
import { followUser, getFollowCounts, isFollowingUser, unfollowUser } from '../../services/follows';
import { Post, User } from '../../types';

export default function UserProfileScreen() {
    const { t } = useTranslation();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState<Post[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>();
    const [followLoading, setFollowLoading] = useState(false);
    const [followModalVisible, setFollowModalVisible] = useState(false);
    const [followModalTab, setFollowModalTab] = useState<'followers' | 'following'>('followers');

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            try {
                const [currentUser, userProfile] = await Promise.all([
                    getCurrentUser(),
                    getUserProfile(id)
                ]);

                setCurrentUserId(currentUser?.uid);

                // Load posts for this user
                const userPosts = await fetchPostsByAuthor(id, currentUser?.uid);
                setPosts(userPosts);

                if (userProfile) {
                    const [counts, following] = await Promise.all([
                        getFollowCounts(id),
                        isFollowingUser(currentUser?.uid, id),
                    ]);

                    setUser({
                        ...userProfile,
                        isFollowing: following,
                        stats: {
                            postsCount: userPosts.length,
                            followersCount: counts.followersCount,
                            followingCount: counts.followingCount,
                            appreciationCount: userProfile.stats?.appreciationCount || 0,
                        },
                    });
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id]);

    const handleLikePost = async (postId: string) => {
        if (!currentUserId) return;
        // Optimistic update
        setPosts(prev => prev.map(p =>
            p.id === postId ? {
                ...p,
                isLiked: !p.isLiked,
                likes: p.isLiked ? p.likes - 1 : p.likes + 1
            } : p
        ));
        try {
            await togglePostLike(postId, currentUserId);
        } catch (error) {
            console.error('Error toggling like:', error);
        }
    };

    const handleFollowToggle = async () => {
        if (!id || !currentUserId || !user || currentUserId === id) return;

        const previousFollowing = !!user.isFollowing;
        const nextFollowing = !previousFollowing;
        const previousFollowers = user.stats?.followersCount || 0;

        setFollowLoading(true);
        setUser(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                isFollowing: nextFollowing,
                stats: {
                    postsCount: prev.stats?.postsCount || posts.length,
                    followersCount: Math.max(0, previousFollowers + (nextFollowing ? 1 : -1)),
                    followingCount: prev.stats?.followingCount || 0,
                    appreciationCount: prev.stats?.appreciationCount || 0,
                },
            };
        });

        try {
            if (nextFollowing) {
                await followUser(currentUserId, id);
            } else {
                await unfollowUser(currentUserId, id);
            }

            const [updatedCounts, refreshedPosts] = await Promise.all([
                getFollowCounts(id),
                fetchPostsByAuthor(id, currentUserId),
            ]);

            setPosts(refreshedPosts);
            setUser(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    isFollowing: nextFollowing,
                    stats: {
                        postsCount: refreshedPosts.length,
                        followersCount: updatedCounts.followersCount,
                        followingCount: updatedCounts.followingCount,
                        appreciationCount: prev.stats?.appreciationCount || 0,
                    },
                };
            });
        } catch (error) {
            console.error('Error toggling follow:', error);
            setUser(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    isFollowing: previousFollowing,
                    stats: {
                        postsCount: prev.stats?.postsCount || posts.length,
                        followersCount: previousFollowers,
                        followingCount: prev.stats?.followingCount || 0,
                        appreciationCount: prev.stats?.appreciationCount || 0,
                    },
                };
            });
        } finally {
            setFollowLoading(false);
        }
    };

    const handleFollowStatsPress = (tab: 'followers' | 'following') => {
        setFollowModalTab(tab);
        setFollowModalVisible(true);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1E3A8A" />
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{t('profile.user_not_found')}</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backText}>{t('common.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.blueHeader}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={[styles.backBtn, { position: 'absolute', left: 0 }]}
                        >
                            <ChevronLeft size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.blueHeaderTitle}>{user.displayName}</Text>
                    </View>
                </View>

                <ProfileHeader
                    user={user}
                    isCurrentUser={currentUserId === id}
                    onEditPress={currentUserId === id ? () => router.push('/(auth)/setup') : undefined}
                    onFollowPress={currentUserId && currentUserId !== id ? handleFollowToggle : undefined}
                    followLoading={followLoading}
                    onMessagePress={() => router.push({ pathname: '/messages/[id]' as any, params: { id: id! } })}
                    onFollowStatsPress={handleFollowStatsPress}
                />

                <View style={styles.pageTabContainer}>
                    <View style={styles.pageTab}>
                        <Text style={[styles.pageTabText, styles.pageTabTextActive]}>{t('profile.tabs_works')}</Text>
                        <View style={styles.pageTabIndicator} />
                    </View>
                </View>

                <ProfilePostFeed
                    activeTab="posts"
                    posts={posts}
                    privatePosts={[]}
                    likedPosts={[]} // Placeholder
                    onPostPress={(postId) => router.push({ pathname: '/campus/[id]', params: { id: postId } })}
                    onLikePost={handleLikePost}
                    currentUserId={currentUserId}
                    onAuthorPress={(authorId) => {
                        if (authorId === id || authorId === currentUserId) return;
                        router.push({ pathname: '/profile/[id]' as any, params: { id: authorId } });
                    }}
                />
                <View style={{ height: 100 }} />
            </ScrollView>

            <FollowListModal
                visible={followModalVisible}
                onClose={() => setFollowModalVisible(false)}
                userId={id || ''}
                currentUserId={currentUserId}
                initialTab={followModalTab}
                onFollowCountChange={(followersCount, followingCount) => {
                    // Update the user stats in real-time
                    setUser(prev => {
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    blueHeader: {
        backgroundColor: '#1E3A8A',
        height: 180,
        paddingTop: 64, // Increased for better notch handling
        paddingHorizontal: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        height: 44,
    },
    blueHeaderTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerRightPlaceholder: {
        width: 40,
        height: 40,
    },
    pageTabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        height: 48,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        marginTop: 12,
    },
    pageTab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 12,
    },
    backText: {
        fontSize: 14,
        color: '#1E3A8A',
        fontWeight: 'bold',
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
    }
});

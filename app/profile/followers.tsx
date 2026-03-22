import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Text, TouchableOpacity, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { getFollowersList, getFollowingList, FollowUserInfo } from '../../services/follows';

type TabType = 'followers' | 'following';

export default function FollowersScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { userId, tab } = useLocalSearchParams<{ userId: string; tab?: string }>();
    const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'followers');
    const [followers, setFollowers] = useState<FollowUserInfo[]>([]);
    const [following, setFollowing] = useState<FollowUserInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const [followersList, followingList] = await Promise.all([
                    getFollowersList(userId),
                    getFollowingList(userId),
                ]);
                setFollowers(followersList);
                setFollowing(followingList);
            } catch (error) {
                console.error('Error loading follow lists:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [userId]);

    const currentList = activeTab === 'followers' ? followers : following;
    const emptyText = activeTab === 'followers' ? t('profile.no_followers') : t('profile.no_following');

    const renderUserItem = ({ item }: { item: FollowUserInfo }) => (
        <TouchableOpacity
            style={styles.userRow}
            onPress={() => router.push({ pathname: '/profile/[id]' as any, params: { id: item.uid } })}
            activeOpacity={0.7}
        >
            {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <UserIcon size={20} color="#fff" />
                </View>
            )}
            <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>{item.displayName}</Text>
                {!!item.major && (
                    <Text style={styles.userMajor} numberOfLines={1}>{item.major}</Text>
                )}
            </View>
            <ChevronLeft size={16} color="#D1D5DB" style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {activeTab === 'followers' ? t('profile.followers_title') : t('profile.following_title')}
                </Text>
                <View style={styles.headerPlaceholder} />
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => setActiveTab('followers')}
                >
                    <Text style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}>
                        {t('profile.followers')} ({followers.length})
                    </Text>
                    {activeTab === 'followers' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => setActiveTab('following')}
                >
                    <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
                        {t('profile.following_people')} ({following.length})
                    </Text>
                    {activeTab === 'following' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            ) : currentList.length === 0 ? (
                <View style={styles.centerContainer}>
                    <UserIcon size={48} color="#D1D5DB" />
                    <Text style={styles.emptyText}>{emptyText}</Text>
                </View>
            ) : (
                <FlatList
                    data={currentList}
                    keyExtractor={(item) => item.uid}
                    renderItem={renderUserItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
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
    header: {
        backgroundColor: '#1E3A8A',
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerPlaceholder: {
        width: 36,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        height: 48,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    tabText: {
        fontSize: 15,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    tabTextActive: {
        color: '#111827',
        fontWeight: '700',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 8,
        width: 24,
        height: 3,
        backgroundColor: '#1E3A8A',
        borderRadius: 2,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 60,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 15,
        color: '#9CA3AF',
    },
    listContent: {
        paddingVertical: 8,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        marginHorizontal: 12,
        marginVertical: 4,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
    },
    avatarPlaceholder: {
        backgroundColor: '#1E3A8A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
        minWidth: 0,
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
    userMajor: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
});

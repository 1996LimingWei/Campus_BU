import { useRouter } from 'expo-router';
import { User as UserIcon, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { followUser, FollowUserInfo, getFollowersList, getFollowingList, unfollowUser } from '../../services/follows';

type TabType = 'followers' | 'following';

interface FollowListModalProps {
    visible: boolean;
    onClose: () => void;
    userId: string;
    currentUserId?: string;
    initialTab: TabType;
    onFollowCountChange?: (followersCount: number, followingCount: number) => void;
}

interface UserWithFollowStatus extends FollowUserInfo {
    isFollowing?: boolean;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
    visible,
    onClose,
    userId,
    currentUserId,
    initialTab,
    onFollowCountChange,
}) => {
    const { t } = useTranslation();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const [followers, setFollowers] = useState<UserWithFollowStatus[]>([]);
    const [following, setFollowing] = useState<UserWithFollowStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        visible: boolean;
        targetUserId: string;
        targetUserName: string;
    }>({ visible: false, targetUserId: '', targetUserName: '' });
    // Track follow counts separately to avoid stale closure issues
    const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const loadData = useCallback(async () => {
        console.log('[FollowListModal] loadData called:', { visible, userId, currentUserId });
        if (!visible || !userId) {
            console.log('[FollowListModal] loadData early return - visible or userId missing');
            return;
        }
        setLoading(true);
        try {
            const [followersList, followingList] = await Promise.all([
                getFollowersList(userId),
                getFollowingList(userId),
            ]);
            console.log('[FollowListModal] Loaded lists:', {
                followersCount: followersList.length,
                followingCount: followingList.length,
            });

            // Get the list of users the current user is following
            let currentUserFollowingIds: string[] = [];
            if (currentUserId) {
                const followingListForCurrentUser = await getFollowingList(currentUserId);
                currentUserFollowingIds = followingListForCurrentUser.map(f => f.uid);
                console.log('[FollowListModal] Current user following IDs:', currentUserFollowingIds);
            }

            // For followers list, check if current user is following each follower
            const followersWithStatus: UserWithFollowStatus[] = followersList.map(f => ({
                ...f,
                isFollowing: currentUserFollowingIds.includes(f.uid),
            }));

            // For following list, mark all as following (since they're in the following list)
            const followingWithStatus: UserWithFollowStatus[] = followingList.map(f => ({
                ...f,
                isFollowing: true,
            }));

            console.log('[FollowListModal] Setting state with status');
            setFollowers(followersWithStatus);
            setFollowing(followingWithStatus);
            // Initialize follow counts
            setFollowCounts({
                followers: followersWithStatus.length,
                following: followingWithStatus.length,
            });
        } catch (error) {
            console.error('[FollowListModal] Error loading follow lists:', error);
        } finally {
            setLoading(false);
        }
    }, [visible, userId, currentUserId]);

    useEffect(() => {
        if (visible) {
            loadData();
        }
    }, [visible, loadData]);

    const handleFollowToggle = (targetUserId: string, currentlyFollowing: boolean, targetUserName?: string) => {
        console.log('[FollowListModal] handleFollowToggle called:', {
            targetUserId,
            currentlyFollowing,
            targetUserName,
            currentUserId,
            actionLoading,
        });

        if (!currentUserId) {
            console.log('[FollowListModal] No currentUserId, returning');
            return;
        }
        if (actionLoading) {
            console.log('[FollowListModal] Action already in progress, returning');
            return;
        }

        // If currently following, show confirmation dialog before unfollowing
        if (currentlyFollowing) {
            console.log('[FollowListModal] Showing unfollow confirmation dialog');
            setConfirmDialog({
                visible: true,
                targetUserId,
                targetUserName: targetUserName || '',
            });
        } else {
            console.log('[FollowListModal] Directly following without confirmation');
            // Directly follow without confirmation
            performFollowToggle(targetUserId, currentlyFollowing);
        }
    };

    const handleConfirmUnfollow = () => {
        console.log('[FollowListModal] User confirmed unfollow');
        setConfirmDialog(prev => ({ ...prev, visible: false }));
        performFollowToggle(confirmDialog.targetUserId, true);
    };

    const handleCancelUnfollow = () => {
        console.log('[FollowListModal] User cancelled unfollow');
        setConfirmDialog(prev => ({ ...prev, visible: false }));
    };

    const performFollowToggle = async (targetUserId: string, currentlyFollowing: boolean) => {
        console.log('[FollowListModal] performFollowToggle called:', {
            targetUserId,
            currentlyFollowing,
            currentUserId,
        });

        if (!currentUserId) {
            console.log('[FollowListModal] No currentUserId in performFollowToggle, returning');
            return;
        }

        setActionLoading(targetUserId);
        try {
            if (currentlyFollowing) {
                console.log('[FollowListModal] Calling unfollowUser');
                await unfollowUser(currentUserId, targetUserId);
                console.log('[FollowListModal] unfollowUser succeeded');
            } else {
                console.log('[FollowListModal] Calling followUser');
                await followUser(currentUserId, targetUserId);
                console.log('[FollowListModal] followUser succeeded');
            }

            // Update local state
            console.log('[FollowListModal] Updating local state');
            const updateList = (list: UserWithFollowStatus[]) =>
                list.map(u => u.uid === targetUserId ? { ...u, isFollowing: !currentlyFollowing } : u);

            setFollowers(prev => {
                console.log('[FollowListModal] setFollowers called');
                return updateList(prev);
            });
            setFollowing(prev => {
                console.log('[FollowListModal] setFollowing called');
                return updateList(prev);
            });

            // Update follow counts based on the action
            const newFollowingCount = currentlyFollowing
                ? Math.max(0, followCounts.following - 1)  // Unfollowing: decrease by 1
                : followCounts.following + 1;              // Following: increase by 1
            console.log('[FollowListModal] Updating follow counts:', {
                old: followCounts.following,
                new: newFollowingCount,
                action: currentlyFollowing ? 'unfollow' : 'follow',
            });
            setFollowCounts(prev => ({
                ...prev,
                following: newFollowingCount,
            }));

            // Notify parent component about the count change
            if (onFollowCountChange) {
                console.log('[FollowListModal] Calling onFollowCountChange with:', followCounts.followers, newFollowingCount);
                onFollowCountChange(followCounts.followers, newFollowingCount);
            }
        } catch (error) {
            console.error('[FollowListModal] Error toggling follow:', error);
        } finally {
            console.log('[FollowListModal] Setting actionLoading to null');
            setActionLoading(null);
        }
    };

    const handleUserPress = (targetUserId: string) => {
        onClose();
        if (targetUserId === currentUserId) {
            router.push('/(tabs)/profile');
        } else {
            router.push({ pathname: '/profile/[id]' as any, params: { id: targetUserId } });
        }
    };

    const renderUserItem = ({ item }: { item: UserWithFollowStatus }) => {
        console.log('[FollowListModal] renderUserItem:', {
            uid: item.uid,
            displayName: item.displayName,
            isFollowing: item.isFollowing,
            currentUserId,
        });

        const isCurrentUserItem = item.uid === currentUserId;
        const showFollowButton = !isCurrentUserItem && currentUserId;

        // Determine button text and style based on follow status
        // isFollowing = true: show "已关注" (black on gray)
        // isFollowing = false: show "关注" (red on light red)
        const buttonText = item.isFollowing
            ? t('profile.followed', '已关注')
            : t('profile.follow', '关注');
        const buttonStyle = item.isFollowing
            ? styles.followedButton
            : styles.followButton;
        const buttonTextStyle = item.isFollowing
            ? styles.followedButtonText
            : styles.followButtonText;

        console.log('[FollowListModal] Button config:', {
            buttonText,
            isFollowing: item.isFollowing,
            showFollowButton,
        });

        return (
            <View style={styles.userRow}>
                <TouchableOpacity
                    style={styles.userInfoSection}
                    onPress={() => handleUserPress(item.uid)}
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
                </TouchableOpacity>

                {showFollowButton && (
                    <TouchableOpacity
                        style={[styles.actionButton, buttonStyle, actionLoading === item.uid && styles.actionButtonDisabled]}
                        onPress={() => {
                            console.log('[FollowListModal] Button pressed for:', item.displayName, 'isFollowing:', item.isFollowing);
                            handleFollowToggle(item.uid, !!item.isFollowing, item.displayName);
                        }}
                        disabled={actionLoading === item.uid}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.actionButtonText, buttonTextStyle]}>
                            {actionLoading === item.uid ? '...' : buttonText}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const currentList = activeTab === 'followers' ? followers : following;
    const emptyText = activeTab === 'followers'
        ? t('profile.no_followers', '暂无粉丝')
        : t('profile.no_following', '暂无关注');

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerPlaceholder} />
                        <Text style={styles.headerTitle}>
                            {activeTab === 'followers'
                                ? t('profile.followers_title', '粉丝列表')
                                : t('profile.following_title', '关注列表')}
                        </Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={styles.tab}
                            onPress={() => setActiveTab('following')}
                        >
                            <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
                                {t('profile.following_people', '关注')} ({following.length})
                            </Text>
                            {activeTab === 'following' && <View style={styles.tabIndicator} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.tab}
                            onPress={() => setActiveTab('followers')}
                        >
                            <Text style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}>
                                {t('profile.followers', '粉丝')} ({followers.length})
                            </Text>
                            {activeTab === 'followers' && <View style={styles.tabIndicator} />}
                        </TouchableOpacity>
                    </View>

                    {/* List */}
                    <View style={styles.listContainer}>
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
                                showsVerticalScrollIndicator={true}
                            />
                        )}
                    </View>

                    {/* Confirmation Dialog */}
                    {confirmDialog.visible && (
                        <View style={styles.confirmOverlay}>
                            <View style={styles.confirmDialog}>
                                <Text style={styles.confirmTitle}>
                                    {t('profile.unfollow_confirm', '不再关注该作者？')}
                                </Text>
                                <View style={styles.confirmButtons}>
                                    <TouchableOpacity
                                        style={[styles.confirmButton, styles.confirmButtonCancel]}
                                        onPress={handleCancelUnfollow}
                                    >
                                        <Text style={styles.confirmButtonTextCancel}>
                                            {t('common.cancel', '取消')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.confirmButton, styles.confirmButtonConfirm]}
                                        onPress={handleConfirmUnfollow}
                                    >
                                        <Text style={styles.confirmButtonTextConfirm}>
                                            {t('profile.unfollow', '不再关注')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        minHeight: '50%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerPlaceholder: {
        width: 40,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
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
    listContainer: {
        maxHeight: 500,
        minHeight: 200,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 15,
        color: '#9CA3AF',
    },
    listContent: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    userInfoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
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
    actionButton: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        minWidth: 72,
        alignItems: 'center',
    },
    actionButtonDisabled: {
        opacity: 0.6,
    },
    followedButton: {
        backgroundColor: '#F3F4F6',
        borderColor: '#E5E7EB',
    },
    followButton: {
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
    },
    actionButtonText: {
        fontSize: 13,
        fontWeight: '500',
    },
    followedButtonText: {
        color: '#111827',
    },
    followButtonText: {
        color: '#EF4444',
    },
    confirmOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    confirmDialog: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '80%',
        maxWidth: 300,
        alignItems: 'center',
    },
    confirmTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 24,
        textAlign: 'center',
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    confirmButtonCancel: {
        backgroundColor: '#F3F4F6',
    },
    confirmButtonConfirm: {
        backgroundColor: '#FEE2E2',
    },
    confirmButtonTextCancel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6B7280',
    },
    confirmButtonTextConfirm: {
        fontSize: 15,
        fontWeight: '600',
        color: '#EF4444',
    },
});

import { Camera, Edit3, MessageCircle, User as UserIcon } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { User } from '../../types';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isAdminSync, isHKBUEmail } from '../../utils/userUtils';
import { AdminBadge } from '../common/AdminBadge';
import { CachedRemoteImage } from '../common/CachedRemoteImage';
import { EduBadge } from '../common/EduBadge';

interface ProfileHeaderProps {
    user: User | null;
    loading?: boolean;
    isCurrentUser: boolean;
    onEditPress?: () => void;
    onSettingsPress?: () => void;
    onFollowPress?: () => void;
    onMessagePress?: () => void;
    onFollowersPress?: () => void;
    onFollowingPress?: () => void;
    followLoading?: boolean;
    onFollowStatsPress?: (tab: 'followers' | 'following') => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
    user,
    loading = false,
    isCurrentUser,
    onEditPress,
    onSettingsPress,
    onFollowPress,
    onMessagePress,
    onFollowersPress,
    onFollowingPress,
    followLoading = false,
    onFollowStatsPress,
}) => {
    const { t } = useTranslation();

    if (loading) {
        return (
            <View style={styles.cardContainer}>
                <View style={styles.avatarSection}>
                    <View style={[styles.avatar, styles.loadingAvatar]} />
                    <View style={styles.loadingContent}>
                        <View style={styles.loadingNameBar} />
                        <View style={styles.loadingMetaBar} />
                        <View style={styles.loadingMetaBarShort} />
                    </View>
                </View>
            </View>
        );
    }

    const displayName = user?.displayName || t('profile.guest_name');
    const isGuest = !user;
    const subtitle = isGuest
        ? t('profile.guest_hint')
        : (user.major || user.bio || '');
    const showEditAction = !isGuest && isCurrentUser && !!onEditPress;
    const showFollowAction = !isGuest && !isCurrentUser && !!onFollowPress;
    const showMessageAction = !isCurrentUser && !isGuest && !!onMessagePress;
    const followLabel = followLoading
        ? t('profile.follow_loading')
        : (user?.isFollowing ? t('profile.followed') : t('profile.follow'));

    const followersCount = user?.stats?.followersCount || 0;
    const followingCount = user?.stats?.followingCount || 0;

    return (
        <View style={styles.cardContainer}>
            <View style={styles.avatarSection}>
                <View style={styles.avatarWrapper}>
                    {isRemoteImageUrl(user?.avatarUrl) ? (
                        <CachedRemoteImage uri={user.avatarUrl} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            <UserIcon size={32} color="#fff" />
                        </View>
                    )}
                    {showEditAction && (
                        <TouchableOpacity style={styles.cameraBtn} onPress={onEditPress}>
                            <Camera size={12} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.contentSection}>
                    <View style={styles.topRow}>
                        <View style={styles.infoSection}>
                            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                            {!isGuest && (
                                <View style={styles.badgeRow}>
                                    <EduBadge shouldShow={isHKBUEmail(user.email)} size="small" />
                                    <AdminBadge shouldShow={isAdminSync(user.uid)} size="small" />
                                </View>
                            )}
                            <Text style={styles.bio} numberOfLines={1}>{subtitle}</Text>
                            {!isGuest && user?.stats && onFollowStatsPress && (
                                <View style={styles.followStatsRow}>
                                    <TouchableOpacity
                                        style={styles.followStatItem}
                                        onPress={() => onFollowStatsPress('following')}
                                        activeOpacity={0.6}
                                    >
                                        <Text style={styles.followStatText}>
                                            {followingCount}{t('profile.following_people', '关注')}
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={styles.followStatDivider}> </Text>
                                    <TouchableOpacity
                                        style={styles.followStatItem}
                                        onPress={() => onFollowStatsPress('followers')}
                                        activeOpacity={0.6}
                                    >
                                        <Text style={styles.followStatText}>
                                            {followersCount}{t('profile.followers', '粉丝')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {showEditAction && (
                            <TouchableOpacity style={styles.editIconBtn} onPress={onEditPress}>
                                <Edit3 size={20} color="#1E3A8A" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {(showFollowAction || showMessageAction) && (
                        <View style={styles.actionRow}>
                            {showFollowAction && (
                                <TouchableOpacity
                                    style={[
                                        styles.followBtn,
                                        showMessageAction && styles.followBtnFlex,
                                        user?.isFollowing && styles.followBtnFollowing,
                                        followLoading && styles.followBtnDisabled,
                                    ]}
                                    onPress={onFollowPress}
                                    disabled={followLoading}
                                    activeOpacity={0.85}
                                >
                                    <Text
                                        style={[
                                            styles.followBtnText,
                                            user?.isFollowing && styles.followBtnTextFollowing,
                                        ]}
                                    >
                                        {followLabel}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {showMessageAction && (
                                <TouchableOpacity
                                    style={styles.messageIconBtn}
                                    onPress={onMessagePress}
                                    activeOpacity={0.7}
                                >
                                    <MessageCircle size={20} color="#1E3A8A" />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: -40, // Overlap with blue header
        padding: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 6,
    },
    avatarSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    avatarWrapper: {
        position: 'relative',
        marginRight: 16,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#F3F4F6',
    },
    avatarPlaceholder: {
        backgroundColor: '#1E3A8A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    contentSection: {
        flex: 1,
        minWidth: 0,
    },
    loadingAvatar: {
        marginRight: 16,
        backgroundColor: '#E5E7EB',
    },
    loadingContent: {
        flex: 1,
        justifyContent: 'center',
        gap: 10,
    },
    loadingNameBar: {
        width: '55%',
        height: 20,
        borderRadius: 10,
        backgroundColor: '#E5E7EB',
    },
    loadingMetaBar: {
        width: '72%',
        height: 14,
        borderRadius: 7,
        backgroundColor: '#EEF2FF',
    },
    loadingMetaBarShort: {
        width: '42%',
        height: 14,
        borderRadius: 7,
        backgroundColor: '#F1F5F9',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    infoSection: {
        flex: 1,
        minWidth: 0,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: 6,
        marginLeft: -4,
    },
    name: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    bio: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 6,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        marginRight: 3,
    },
    statLabel: {
        fontSize: 13,
        color: '#6B7280',
    },
    statDivider: {
        width: 1,
        height: 14,
        backgroundColor: '#E5E7EB',
        marginHorizontal: 12,
    },
    editIconBtn: {
        marginLeft: 12,
        padding: 8,
    },
    followBtn: {
        minWidth: 96,
        paddingHorizontal: 16,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#1E3A8A',
        borderWidth: 1,
        borderColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 2,
    },
    followBtnFlex: {
        flex: 1,
    },
    followBtnFollowing: {
        backgroundColor: '#FFFFFF',
        borderColor: '#D1D5DB',
        shadowOpacity: 0,
        elevation: 0,
    },
    followBtnDisabled: {
        opacity: 0.65,
    },
    followBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.2,
    },
    followBtnTextFollowing: {
        color: '#4B5563',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 14,
    },
    messageIconBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    followStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    followStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    followStatText: {
        fontSize: 13,
        color: '#111827',
        fontWeight: '500',
    },
    followStatDivider: {
        fontSize: 13,
        color: '#9CA3AF',
        marginHorizontal: 8,
    },
});

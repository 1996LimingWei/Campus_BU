import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share } from 'react-native';
import { Camera, Edit3, User as UserIcon } from 'lucide-react-native';
import { User } from '../../types';
import { EduBadge } from '../common/EduBadge';
import { isHKBUEmail } from '../../utils/userUtils';

interface ProfileHeaderProps {
    user: User | null;
    isCurrentUser: boolean;
    onEditPress?: () => void;
    onSettingsPress?: () => void;
    onFollowPress?: () => void;
    onMessagePress?: () => void;
    followLoading?: boolean;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
    user,
    isCurrentUser,
    onEditPress,
    onSettingsPress,
    onFollowPress,
    onMessagePress,
    followLoading = false,
}) => {
    const handleShare = async () => {
        if (!user) return;
        try {
            await Share.share({
                message: `来看看 ${user.displayName} 的 HKCampus 主页！`,
                url: `https://hkcampus.app/profile/${user.uid}`,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const displayName = user?.displayName || '访客';
    const isGuest = !user;
    const subtitle = isGuest
        ? '登录后开启更多精彩功能'
        : (user.major || user.bio || '');
    const showEditAction = !isGuest && isCurrentUser && !!onEditPress;
    const showFollowAction = !isGuest && !isCurrentUser && !!onFollowPress;
    const followLabel = followLoading
        ? '处理中...'
        : (user?.isFollowing ? '已关注' : '关注');

    return (
        <View style={styles.cardContainer}>
            <View style={styles.avatarSection}>
                <View style={styles.avatarWrapper}>
                    {user?.avatarUrl ? (
                        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
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

                <View style={styles.infoSection}>
                    <View style={styles.nameRow}>
                        <Text style={styles.name}>{displayName}</Text>
                        {!isGuest && <EduBadge shouldShow={isHKBUEmail(user.email)} size="small" />}
                    </View>
                    <Text style={styles.bio} numberOfLines={1}>{subtitle}</Text>
                    {!isGuest && user?.stats && (
                        <Text style={styles.metaText}>
                            {user.stats.followersCount || 0} 粉丝 · {user.stats.followingCount || 0} 关注
                        </Text>
                    )}
                </View>

                {showEditAction && (
                    <TouchableOpacity style={styles.editIconBtn} onPress={onEditPress}>
                        <Edit3 size={20} color="#1E3A8A" />
                    </TouchableOpacity>
                )}

                {showFollowAction && (
                    <TouchableOpacity
                        style={[
                            styles.followBtn,
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
        alignItems: 'center',
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
    infoSection: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    name: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginRight: 8,
    },
    bio: {
        fontSize: 14,
        color: '#6B7280',
    },
    metaText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
    },
    editIconBtn: {
        padding: 8,
    },
    followBtn: {
        minWidth: 78,
        paddingHorizontal: 16,
        height: 36,
        borderRadius: 18,
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
});

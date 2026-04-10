import { useRouter } from 'expo-router';
import { ChevronLeft, User as UserIcon, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getFollowersList, getFollowingList } from '../../services/follows';
import { fetchDirectConversations } from '../../services/messages';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { generatePostShareMessageContent } from '../../utils/shareUtils';
import { CachedRemoteImage } from '../common/CachedRemoteImage';

interface ShareUser {
    uid: string;
    displayName: string;
    avatarUrl: string;
    major: string;
    source: 'following' | 'follower' | 'message';
}

interface SharePostModalProps {
    visible: boolean;
    onClose: () => void;
    onBack?: () => void;
    currentUserId: string;
    postId: string;
    postContent: string;
    postImageUrl?: string;
    onShare: (receiverId: string, message: string) => Promise<void>;
}

export const SharePostModal: React.FC<SharePostModalProps> = ({
    visible,
    onClose,
    onBack,
    currentUserId,
    postId,
    postContent,
    postImageUrl,
    onShare,
}) => {
    const { t } = useTranslation();
    const router = useRouter();
    const [users, setUsers] = useState<ShareUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [sendingUserId, setSendingUserId] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            void loadShareUsers();
            return;
        }
        setSendingUserId(null);
    }, [visible]);

    const loadShareUsers = async () => {
        if (!currentUserId) {
            return;
        }

        setLoading(true);
        try {
            const [followingList, followersList, conversations] = await Promise.all([
                getFollowingList(currentUserId),
                getFollowersList(currentUserId),
                fetchDirectConversations(currentUserId),
            ]);

            const userMap = new Map<string, ShareUser>();

            followingList.forEach((user) => {
                userMap.set(user.uid, {
                    ...user,
                    source: 'following',
                });
            });

            followersList.forEach((user) => {
                if (!userMap.has(user.uid)) {
                    userMap.set(user.uid, {
                        ...user,
                        source: 'follower',
                    });
                }
            });

            conversations.forEach((conversation) => {
                if (!userMap.has(conversation.user.id)) {
                    userMap.set(conversation.user.id, {
                        uid: conversation.user.id,
                        displayName: conversation.user.name,
                        avatarUrl: conversation.user.avatar,
                        major: conversation.user.major,
                        source: 'message',
                    });
                }
            });

            const userList = Array.from(userMap.values()).sort((a, b) =>
                a.displayName.localeCompare(b.displayName),
            );
            setUsers(userList);
        } catch (error) {
            console.error('[SharePostModal] Error loading share users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleShareToUser = async (user: ShareUser) => {
        if (sendingUserId) {
            return;
        }

        setSendingUserId(user.uid);
        try {
            const shareMessage = generatePostShareMessageContent(postId, {
                postContent,
                postImageUrl,
            });

            await onShare(user.uid, shareMessage);
            onClose();
            router.push({
                pathname: '/messages/[id]' as any,
                params: { id: user.uid },
            });
        } catch (error) {
            console.error('[SharePostModal] Error sharing post:', error);
            Alert.alert(
                t('common.error', 'Error'),
                t('profile.share.failed', '分享失败'),
            );
        } finally {
            setSendingUserId(null);
        }
    };

    const handleUserSelect = (user: ShareUser) => {
        if (sendingUserId) {
            return;
        }

        Alert.alert(
            t('profile.share.confirm_share_title', '确认分享'),
            t('profile.share.confirm_share_desc', {
                defaultValue: '将这条帖子分享给 {{name}}？',
                name: user.displayName,
            }),
            [
                { text: t('common.cancel', '取消'), style: 'cancel' },
                {
                    text: t('profile.share.send', '发送'),
                    onPress: () => { void handleShareToUser(user); },
                },
            ],
        );
    };

    const renderUserItem = ({ item }: { item: ShareUser }) => {
        const isSending = sendingUserId === item.uid;
        const disabled = !!sendingUserId;

        return (
            <TouchableOpacity
                style={[styles.userItem, disabled && styles.userItemDisabled]}
                onPress={() => handleUserSelect(item)}
                activeOpacity={0.7}
                disabled={disabled}
            >
                {isRemoteImageUrl(item.avatarUrl) ? (
                    <CachedRemoteImage uri={item.avatarUrl} style={styles.avatar} />
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
                <View style={styles.userAction}>
                    {isSending ? (
                        <ActivityIndicator size="small" color="#1E3A8A" />
                    ) : (
                        <Text style={styles.userActionText}>{t('profile.share.send', '发送')}</Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.modalContent} onPress={(event) => event.stopPropagation()}>
                    <View style={styles.header}>
                        {onBack ? (
                            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                                <ChevronLeft size={24} color="#6B7280" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.headerPlaceholder} />
                        )}
                        <Text style={styles.headerTitle}>
                            {t('profile.share.title', '分享帖子')}
                        </Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.listContainer}>
                        {loading ? (
                            <View style={styles.centerContainer}>
                                <ActivityIndicator size="large" color="#1E3A8A" />
                            </View>
                        ) : users.length === 0 ? (
                            <View style={styles.centerContainer}>
                                <UserIcon size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>
                                    {t('profile.share.no_users', '暂无可分享的用户')}
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={users}
                                keyExtractor={(item) => item.uid}
                                renderItem={renderUserItem}
                                contentContainerStyle={styles.listContent}
                                showsVerticalScrollIndicator={false}
                            />
                        )}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '85%',
        minHeight: '50%',
        flex: 1,
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
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
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
    listContainer: {
        flex: 1,
        maxHeight: 500,
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
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    userItemDisabled: {
        opacity: 0.55,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E5E7EB',
    },
    avatarPlaceholder: {
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
    },
    userMajor: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    userAction: {
        minWidth: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    userActionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E3A8A',
    },
});

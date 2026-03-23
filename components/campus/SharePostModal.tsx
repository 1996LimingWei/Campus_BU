import { useRouter } from 'expo-router';
import { ChevronLeft, Send, Share2, User as UserIcon, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    SlideInDown,
    SlideOutDown
} from 'react-native-reanimated';
import { getFollowersList, getFollowingList } from '../../services/follows';
import { fetchDirectConversations } from '../../services/messages';
import { generatePostShareMessage } from '../../utils/shareUtils';

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
    onBack?: () => void; // Optional callback to go back to settings sheet
    currentUserId: string;
    postId: string;
    postContent: string;
    onShare: (receiverId: string, message: string) => Promise<void>;
}

export const SharePostModal: React.FC<SharePostModalProps> = ({
    visible,
    onClose,
    onBack,
    currentUserId,
    postId,
    postContent,
    onShare,
}) => {
    const { t } = useTranslation();
    const router = useRouter();
    const [users, setUsers] = useState<ShareUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<ShareUser | null>(null);
    const [messageText, setMessageText] = useState('');
    const [showMessageInput, setShowMessageInput] = useState(false);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        console.log('[SharePostModal] visible changed:', visible);
        if (visible) {
            console.log('[SharePostModal] Loading share users, currentUserId:', currentUserId);
            loadShareUsers();
        } else {
            // Reset state when modal closes
            setSelectedUser(null);
            setShowMessageInput(false);
            setMessageText('');
        }
    }, [visible]);

    const loadShareUsers = async () => {
        if (!currentUserId) {
            console.log('[SharePostModal] No currentUserId, skipping load');
            return;
        }
        console.log('[SharePostModal] Starting to load share users...');
        setLoading(true);
        try {
            // Load users from three sources:
            // 1. Users I'm following
            // 2. Users who follow me
            // 3. Users I've messaged with
            console.log('[SharePostModal] Fetching following, followers, and conversations...');
            const [followingList, followersList, conversations] = await Promise.all([
                getFollowingList(currentUserId),
                getFollowersList(currentUserId),
                fetchDirectConversations(currentUserId),
            ]);
            console.log('[SharePostModal] Loaded:', {
                followingCount: followingList.length,
                followersCount: followersList.length,
                conversationsCount: conversations.length
            });

            // Create a map to deduplicate users
            const userMap = new Map<string, ShareUser>();

            // Add following users
            followingList.forEach(user => {
                userMap.set(user.uid, {
                    ...user,
                    source: 'following',
                });
            });

            // Add followers
            followersList.forEach(user => {
                if (!userMap.has(user.uid)) {
                    userMap.set(user.uid, {
                        ...user,
                        source: 'follower',
                    });
                }
            });

            // Add users from conversations
            conversations.forEach(conv => {
                if (!userMap.has(conv.user.id)) {
                    userMap.set(conv.user.id, {
                        uid: conv.user.id,
                        displayName: conv.user.name,
                        avatarUrl: conv.user.avatar,
                        major: conv.user.major,
                        source: 'message',
                    });
                }
            });

            // Convert to array and sort by display name
            const userList = Array.from(userMap.values()).sort((a, b) =>
                a.displayName.localeCompare(b.displayName)
            );
            console.log('[SharePostModal] Total unique users to share with:', userList.length);

            setUsers(userList);
        } catch (error) {
            console.error('[SharePostModal] Error loading share users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserSelect = (user: ShareUser) => {
        console.log('[SharePostModal] User selected:', { uid: user.uid, name: user.displayName });
        setSelectedUser(user);
        setShowMessageInput(true);
    };

    const handleSend = async () => {
        if (!selectedUser || sending) return;
        console.log('[SharePostModal] Sending share to:', selectedUser.uid);
        setSending(true);
        try {
            // Create share message using utility function with environment-based URL
            const shareMessage = generatePostShareMessage(postId, messageText);
            console.log('[SharePostModal] Share message:', shareMessage.substring(0, 100));
            await onShare(selectedUser.uid, shareMessage);
            console.log('[SharePostModal] Share succeeded, closing modal');
            // Close modal after successful share
            onClose();
        } catch (error) {
            console.error('[SharePostModal] Error sharing post:', error);
        } finally {
            setSending(false);
        }
    };

    const handleCloseMessageInput = () => {
        setShowMessageInput(false);
        setSelectedUser(null);
        setMessageText('');
    };

    const renderUserItem = ({ item }: { item: ShareUser }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => handleUserSelect(item)}
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
    );

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
                        {onBack ? (
                            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                                <ChevronLeft size={24} color="#6B7280" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.headerPlaceholder} />
                        )}
                        <Text style={styles.headerTitle}>
                            {t('share.title', '分享帖子')}
                        </Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* User List */}
                    <View style={styles.listContainer}>
                        {loading ? (
                            <View style={styles.centerContainer}>
                                <ActivityIndicator size="large" color="#1E3A8A" />
                            </View>
                        ) : users.length === 0 ? (
                            <View style={styles.centerContainer}>
                                <UserIcon size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>
                                    {t('share.no_users', '暂无可分享的用户')}
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

                    {/* Message Input Modal (slides up from bottom) */}
                    {showMessageInput && selectedUser && (
                        <Animated.View
                            entering={SlideInDown.duration(300)}
                            exiting={SlideOutDown.duration(200)}
                            style={styles.messageInputContainer}
                        >
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                style={styles.keyboardView}
                            >
                                {/* Selected User Header */}
                                <View style={styles.selectedUserHeader}>
                                    <View style={styles.selectedUserInfo}>
                                        {selectedUser.avatarUrl ? (
                                            <Image source={{ uri: selectedUser.avatarUrl }} style={styles.selectedAvatar} />
                                        ) : (
                                            <View style={[styles.selectedAvatar, styles.avatarPlaceholder]}>
                                                <UserIcon size={16} color="#fff" />
                                            </View>
                                        )}
                                        <Text style={styles.selectedUserName} numberOfLines={1}>
                                            {selectedUser.displayName}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={handleCloseMessageInput}>
                                        <X size={20} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>

                                {/* Message Input */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputLabel}>
                                        {t('share.message_label', '和朋友说点什么吧')}
                                    </Text>
                                    <TextInput
                                        style={styles.textInput}
                                        value={messageText}
                                        onChangeText={setMessageText}
                                        placeholder={t('share.message_placeholder', '输入消息...')}
                                        placeholderTextColor="#9CA3AF"
                                        multiline
                                        maxLength={500}
                                        autoFocus
                                    />
                                    <Text style={styles.charCount}>
                                        {messageText.length}/500
                                    </Text>
                                </View>

                                {/* Post Preview */}
                                <View style={styles.postPreview}>
                                    <Share2 size={16} color="#6B7280" />
                                    <Text style={styles.postPreviewText} numberOfLines={2}>
                                        {postContent}
                                    </Text>
                                </View>

                                {/* Send Button */}
                                <TouchableOpacity
                                    style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                                    onPress={handleSend}
                                    disabled={sending}
                                    activeOpacity={0.7}
                                >
                                    {sending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Send size={18} color="#fff" />
                                            <Text style={styles.sendButtonText}>
                                                {t('share.send', '发送')}
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </KeyboardAvoidingView>
                        </Animated.View>
                    )}
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
    messageInputContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10,
    },
    keyboardView: {
        width: '100%',
    },
    selectedUserHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    selectedUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    selectedAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E5E7EB',
    },
    selectedUserName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 10,
        flex: 1,
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111827',
        minHeight: 80,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 4,
    },
    postPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
    },
    postPreviewText: {
        fontSize: 14,
        color: '#6B7280',
        marginLeft: 8,
        flex: 1,
    },
    sendButton: {
        backgroundColor: '#1E3A8A',
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sendButtonDisabled: {
        opacity: 0.6,
    },
    sendButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, FileText, Image as ImageIcon, MoreVertical, Plus, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZoomableImageCarousel } from '../../components/common/ZoomableImageCarousel';
import { useNotifications } from '../../context/NotificationContext';
import { getCurrentUser } from '../../services/auth';
import { reportContent, ReportReason } from '../../services/moderation';
import {
    createDirectFileMessageContent,
    createDirectImageMessageContent,
    deleteDirectMessage,
    fetchDirectMessages,
    getDirectMessageCopyText,
    getDirectMessageFilePayload,
    getDirectMessageImageUrl,
    isDirectFileContent,
    isDirectImageContent,
    markConversationAsRead,
    sendDirectMessage,
    subscribeToDirectConversation,
    uploadDirectMessageFile,
    uploadDirectMessageImage,
} from '../../services/messages';
import { DirectMessage, DirectMessagePeer } from '../../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const isValidUrl = (value?: string) => !!value && (value.startsWith('http://') || value.startsWith('https://'));

const formatMessageTime = (date: Date) => date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
});

const getFileExtensionLabel = (fileName?: string) => {
    const extension = fileName?.split('.').pop()?.trim();
    if (!extension || extension === fileName) {
        return 'FILE';
    }
    return extension.slice(0, 6).toUpperCase();
};

export default function ChatScreen() {
    const params = useLocalSearchParams<{ id?: string | string[] }>();
    const peerUserId = Array.isArray(params.id) ? params.id[0] : params.id;
    const { t } = useTranslation();
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const { refreshCount } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [peer, setPeer] = useState<DirectMessagePeer | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const attachmentAnim = useRef(new Animated.Value(0)).current;
    const REPORT_REASONS: Array<{ label: string; value: ReportReason }> = [
        { label: '垃圾内容', value: 'spam' },
        { label: '骚扰辱骂', value: 'harassment' },
        { label: '仇恨/歧视', value: 'hate_speech' },
        { label: '色情低俗', value: 'sexual_content' },
        { label: '其他', value: 'other' },
    ];

    useEffect(() => {
        Animated.timing(attachmentAnim, {
            toValue: showAttachmentMenu ? 1 : 0,
            duration: 220,
            useNativeDriver: false,
        }).start();
    }, [attachmentAnim, showAttachmentMenu]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const keyboardShowSubscription = Keyboard.addListener(showEvent, () => {
            setShowAttachmentMenu(false);
        });

        return () => {
            keyboardShowSubscription.remove();
        };
    }, []);

    const loadThread = useCallback(async (silent = false) => {
        if (!peerUserId) {
            setLoading(false);
            return;
        }

        try {
            if (!silent) {
                setLoading(true);
            }

            const user = currentUser || await getCurrentUser();
            setCurrentUser(user);

            if (!user?.uid) {
                setMessages([]);
                setPeer(null);
                setConversationId(null);
                return;
            }

            const thread = await fetchDirectMessages(user.uid, peerUserId);
            setPeer(thread.peer);
            setConversationId(thread.conversationId);

            const hasUnreadIncoming = thread.messages.some((message) =>
                message.receiverId === user.uid && !message.readAt
            );

            if (thread.conversationId && hasUnreadIncoming) {
                await markConversationAsRead(thread.conversationId, user.uid);
                try {
                    await refreshCount();
                } catch (error) {
                    console.error('Error refreshing unread counts after marking conversation read:', error);
                }

                const now = new Date();
                setMessages(thread.messages.map((message) => (
                    message.receiverId === user.uid && !message.readAt
                        ? { ...message, readAt: now }
                        : message
                )));
            } else {
                setMessages(thread.messages);
            }
        } catch (error) {
            console.error('Error loading direct messages:', error);
            setMessages([]);
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, [currentUser, peerUserId, refreshCount]);

    useEffect(() => {
        loadThread();
    }, [loadThread]);

    useEffect(() => {
        if (!conversationId) {
            return;
        }

        return subscribeToDirectConversation(conversationId, () => {
            loadThread(true);
        });
    }, [conversationId, loadThread]);

    useEffect(() => {
        if (messages.length > 0) {
            requestAnimationFrame(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            });
        }
    }, [messages.length]);

    const sendOptimisticMessage = useCallback(async (optimisticMessage: DirectMessage, content: string) => {
        if (!currentUser?.uid || !peerUserId) {
            return;
        }

        setMessages((previous) => [...previous, optimisticMessage]);
        setSending(true);

        try {
            const result = await sendDirectMessage(currentUser.uid, peerUserId, content);
            setConversationId(result.conversationId);
            await loadThread(true);
        } catch (error) {
            console.error('Error sending direct attachment message:', error);
            setMessages((previous) => previous.filter((message) => message.id !== optimisticMessage.id));
            throw error;
        } finally {
            setSending(false);
        }
    }, [currentUser?.uid, loadThread, peerUserId]);

    const handlePickImage = useCallback(async () => {
        if (!currentUser?.uid || !peerUserId || sending) {
            return;
        }

        setShowAttachmentMenu(false);

        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'Please allow photo access to send images.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: false,
                quality: 0.7,
            });

            if (result.canceled || !result.assets[0]?.uri) {
                return;
            }

            const imageUri = result.assets[0].uri;
            const optimisticMessage: DirectMessage = {
                id: `temp-image-${Date.now()}`,
                conversationId: conversationId || 'pending',
                senderId: currentUser.uid,
                receiverId: peerUserId,
                content: createDirectImageMessageContent(imageUri),
                createdAt: new Date(),
                readAt: null,
                senderName: currentUser.displayName || 'Me',
                senderAvatar: currentUser.avatarUrl || currentUser.photoURL || '',
            };

            const uploadedUrl = await uploadDirectMessageImage(imageUri);
            await sendOptimisticMessage(
                optimisticMessage,
                createDirectImageMessageContent(uploadedUrl),
            );
        } catch (error) {
            console.error('Error picking direct message image:', error);
        }
    }, [conversationId, currentUser, peerUserId, sendOptimisticMessage, sending]);

    const handleTakePhoto = useCallback(async () => {
        if (!currentUser?.uid || !peerUserId || sending) {
            return;
        }

        setShowAttachmentMenu(false);

        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'Please allow camera access to take photos.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
            });

            if (result.canceled || !result.assets[0]?.uri) {
                return;
            }

            const imageUri = result.assets[0].uri;
            const optimisticMessage: DirectMessage = {
                id: `temp-camera-${Date.now()}`,
                conversationId: conversationId || 'pending',
                senderId: currentUser.uid,
                receiverId: peerUserId,
                content: createDirectImageMessageContent(imageUri),
                createdAt: new Date(),
                readAt: null,
                senderName: currentUser.displayName || 'Me',
                senderAvatar: currentUser.avatarUrl || currentUser.photoURL || '',
            };

            const uploadedUrl = await uploadDirectMessageImage(imageUri);
            await sendOptimisticMessage(
                optimisticMessage,
                createDirectImageMessageContent(uploadedUrl),
            );
        } catch (error) {
            console.error('Error taking direct message photo:', error);
        }
    }, [conversationId, currentUser, peerUserId, sendOptimisticMessage, sending]);

    const handlePickFile = useCallback(async () => {
        if (!currentUser?.uid || !peerUserId || sending) {
            return;
        }

        setShowAttachmentMenu(false);

        try {
            const result = await DocumentPicker.getDocumentAsync({
                multiple: false,
                copyToCacheDirectory: true,
                type: '*/*',
            });

            if (result.canceled || !result.assets[0]?.uri) {
                return;
            }

            const file = result.assets[0];
            const uploadedFile = await uploadDirectMessageFile(file.uri, file.name, file.mimeType);
            const optimisticMessage: DirectMessage = {
                id: `temp-file-${Date.now()}`,
                conversationId: conversationId || 'pending',
                senderId: currentUser.uid,
                receiverId: peerUserId,
                content: createDirectFileMessageContent(uploadedFile),
                createdAt: new Date(),
                readAt: null,
                senderName: currentUser.displayName || 'Me',
                senderAvatar: currentUser.avatarUrl || currentUser.photoURL || '',
            };

            await sendOptimisticMessage(
                optimisticMessage,
                createDirectFileMessageContent(uploadedFile),
            );
        } catch (error) {
            console.error('Error picking direct message file:', error);
        }
    }, [conversationId, currentUser, peerUserId, sendOptimisticMessage, sending]);

    const handleSend = useCallback(async () => {
        const trimmed = inputText.trim();
        if (!trimmed || !currentUser?.uid || !peerUserId || sending) {
            return;
        }

        const optimisticMessage: DirectMessage = {
            id: `temp-${Date.now()}`,
            conversationId: conversationId || 'pending',
            senderId: currentUser.uid,
            receiverId: peerUserId,
            content: trimmed,
            createdAt: new Date(),
            readAt: null,
            senderName: currentUser.displayName || 'Me',
            senderAvatar: currentUser.avatarUrl || currentUser.photoURL || '',
        };

        setMessages((previous) => [...previous, optimisticMessage]);
        setInputText('');
        setSending(true);

        try {
            const result = await sendDirectMessage(currentUser.uid, peerUserId, trimmed);
            setConversationId(result.conversationId);
            await loadThread(true);
        } catch (error) {
            console.error('Error sending direct message:', error);
            setMessages((previous) => previous.filter((message) => message.id !== optimisticMessage.id));
            setInputText(trimmed);
        } finally {
            setSending(false);
        }
    }, [conversationId, currentUser, inputText, loadThread, peerUserId, sending]);

    const handleToggleAttachmentMenu = useCallback(() => {
        setShowAttachmentMenu((previous) => {
            const next = !previous;
            if (next) {
                inputRef.current?.blur();
                Keyboard.dismiss();
            }
            return next;
        });
    }, []);

    const handleInputFocus = useCallback(() => {
        setShowAttachmentMenu(false);
    }, []);

    const headerSubtitle = useMemo(() => {
        if (peer?.major) {
            return peer.major;
        }
        return t('messages.offline');
    }, [peer?.major, t]);

    const previewImages = useMemo(() => messages
        .map((message) => ({
            id: message.id,
            url: getDirectMessageImageUrl(message.content),
        }))
        .filter((item) => !!item.url), [messages]);

    const openImagePreview = useCallback((messageId: string) => {
        const index = previewImages.findIndex((item) => item.id === messageId);
        if (index >= 0) {
            setPreviewIndex(index);
        }
    }, [previewImages]);

    const handleReportDirectMessage = useCallback((message: DirectMessage, reason: ReportReason) => {
        if (!currentUser?.uid) {
            return;
        }

        reportContent({
            reporterId: currentUser.uid,
            targetId: message.id,
            targetType: 'comment',
            reason,
        }).then(() => {
            Alert.alert('已举报', '感谢你帮助维护社区安全。我们将核实此内容。');
        }).catch((error) => {
            console.error('Error reporting direct message:', error);
            Alert.alert('举报失败', '请稍后再试。');
        });
    }, [currentUser?.uid]);

    const promptReportDirectMessage = useCallback((message: DirectMessage) => {
        Alert.alert(
            '举报内容',
            '你为什么要举报这个消息？',
            [
                ...REPORT_REASONS.map((reason) => ({
                    text: reason.label,
                    onPress: () => handleReportDirectMessage(message, reason.value),
                })),
                { text: '取消', style: 'cancel' as const },
            ],
        );
    }, [handleReportDirectMessage]);

    const handleRecallDirectMessage = useCallback(async (message: DirectMessage) => {
        if (!currentUser?.uid || message.senderId !== currentUser.uid) {
            return;
        }

        try {
            setMessages((previous) => previous.filter((item) => item.id !== message.id));
            await deleteDirectMessage(message.id, currentUser.uid);
        } catch (error) {
            console.error('Error recalling direct message:', error);
            await loadThread(true);
            Alert.alert('撤回失败', '请稍后再试。');
        }
    }, [currentUser?.uid, loadThread]);

    const openDirectMessageActions = useCallback((message: DirectMessage) => {
        const copyText = getDirectMessageCopyText(message.content);
        const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
            {
                text: '复制',
                onPress: () => {
                    Clipboard.setStringAsync(copyText).then(() => {
                        Alert.alert('已复制', '内容已复制到剪贴板。');
                    }).catch((error) => {
                        console.error('Error copying direct message:', error);
                        Alert.alert('复制失败', '请稍后再试。');
                    });
                },
            },
            {
                text: '举报',
                onPress: () => promptReportDirectMessage(message),
            },
        ];

        if (message.senderId === currentUser?.uid) {
            actions.push({
                text: '撤回',
                style: 'destructive',
                onPress: () => {
                    Alert.alert(
                        '撤回消息',
                        '确定撤回这条消息吗？撤回即删除消息。',
                        [
                            { text: '取消', style: 'cancel' },
                            {
                                text: '撤回',
                                style: 'destructive',
                                onPress: () => { void handleRecallDirectMessage(message); },
                            },
                        ],
                    );
                },
            });
        }

        actions.push({ text: '取消', style: 'cancel' });
        Alert.alert('消息操作', '请选择操作', actions);
    }, [currentUser?.uid, handleRecallDirectMessage, promptReportDirectMessage]);

    const renderMessage = ({ item }: { item: DirectMessage }) => {
        const isMe = item.senderId === currentUser?.uid;
        const imageUrl = getDirectMessageImageUrl(item.content);
        const isImageMessage = isDirectImageContent(item.content) && !!imageUrl;
        const filePayload = getDirectMessageFilePayload(item.content);
        const isFileMessage = isDirectFileContent(item.content) && !!filePayload;
        const fileExtensionLabel = filePayload ? getFileExtensionLabel(filePayload.name) : 'FILE';

        return (
            <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
                {!isMe && (
                    isValidUrl(item.senderAvatar) ? (
                        <Image source={{ uri: item.senderAvatar }} style={styles.avatarMini} />
                    ) : (
                        <View style={[styles.avatarMini, styles.avatarMiniFallback]}>
                            <Text style={styles.avatarMiniFallbackText}>
                                {(item.senderName || peer?.name || '?').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )
                )}
                <View style={[
                    styles.bubble,
                    isMe ? styles.myBubble : styles.theirBubble,
                    isImageMessage && styles.imageBubble,
                    isFileMessage && styles.fileBubble,
                ]}>
                    <Pressable onLongPress={() => openDirectMessageActions(item)}>
                    {isImageMessage ? (
                        <Pressable onPress={() => openImagePreview(item.id)} style={styles.imageMessagePressable}>
                            <Image source={{ uri: imageUrl }} style={styles.messageImage} />
                            <View style={styles.imageTimeOverlay}>
                                <Text style={styles.imageTimeText}>
                                    {formatMessageTime(item.createdAt)}
                                </Text>
                            </View>
                        </Pressable>
                    ) : isFileMessage && filePayload ? (
                        <>
                            <TouchableOpacity
                                style={[styles.fileMessageButton, isMe ? styles.myFileMessageButton : styles.theirFileMessageButton]}
                                activeOpacity={0.8}
                                onPress={() => Linking.openURL(filePayload.url).catch((error) => {
                                    console.error('Error opening direct message file:', error);
                                })}
                            >
                                <View style={styles.fileMessageTopRow}>
                                    <View style={[styles.fileIconWrap, isMe ? styles.myFileIconWrap : styles.theirFileIconWrap]}>
                                        <FileText size={20} color={isMe ? '#1E3A8A' : '#334155'} />
                                    </View>
                                    <View style={styles.fileMeta}>
                                        <Text
                                            style={[styles.fileName, isMe ? styles.myText : styles.theirText]}
                                            numberOfLines={2}
                                        >
                                            {filePayload.name}
                                        </Text>
                                        <View style={styles.fileMetaRow}>
                                            <View style={[styles.fileTypeBadge, isMe ? styles.myFileTypeBadge : styles.theirFileTypeBadge]}>
                                                <Text style={[styles.fileTypeBadgeText, isMe ? styles.myFileTypeBadgeText : styles.theirFileTypeBadgeText]}>
                                                    {fileExtensionLabel}
                                                </Text>
                                            </View>
                                            <Text style={[styles.fileInlineTime, isMe ? styles.myFileInlineTime : styles.theirFileInlineTime]}>
                                                {formatMessageTime(item.createdAt)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
                                {item.content}
                            </Text>
                            <View style={styles.textTimeRow}>
                                <Text style={[styles.timeText, isMe ? styles.myTime : styles.theirTime]}>
                                    {formatMessageTime(item.createdAt)}
                                </Text>
                            </View>
                        </>
                    )}
                    </Pressable>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#111827" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerProfile}
                    activeOpacity={0.7}
                    disabled={!peer?.id}
                    onPress={() => {
                        if (!peer?.id) {
                            return;
                        }
                        router.push({ pathname: '/profile/[id]' as any, params: { id: peer.id } });
                    }}
                >
                    {isValidUrl(peer?.avatar) ? (
                        <Image source={{ uri: peer!.avatar }} style={styles.headerAvatar} />
                    ) : (
                        <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                            <Text style={styles.headerAvatarFallbackText}>
                                {(peer?.name || 'C').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>
                            {peer?.name || 'Chat'}
                        </Text>
                        <Text style={styles.headerStatus} numberOfLines={1}>
                            {headerSubtitle}
                        </Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreButton} activeOpacity={0.7}>
                    <MoreVertical size={24} color="#111827" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#1E3A8A" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={[
                            styles.messageList,
                            messages.length === 0 && styles.messageListEmpty,
                        ]}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyTitle}>{t('messages.no_messages')}</Text>
                                <Text style={styles.emptySubtitle}>{t('messages.say_hi')}</Text>
                            </View>
                        }
                    />
                )}

                <View style={styles.inputWrapper}>
                    <TouchableOpacity
                        style={[styles.attachButton, showAttachmentMenu && styles.attachButtonActive]}
                        activeOpacity={0.7}
                        onPress={handleToggleAttachmentMenu}
                    >
                        <Plus size={24} color={showAttachmentMenu ? '#1E3A8A' : '#9CA3AF'} />
                    </TouchableOpacity>
                    <View style={styles.inputContainer}>
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholder={t('messages.input_placeholder')}
                            value={inputText}
                            onChangeText={setInputText}
                            onFocus={handleInputFocus}
                            multiline
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!inputText.trim() || sending) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || sending}
                    >
                        <Send size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                <Animated.View
                    style={[
                        styles.attachmentPanel,
                        {
                            maxHeight: attachmentAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 184],
                            }),
                            opacity: attachmentAnim,
                            paddingTop: attachmentAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 18],
                            }),
                            paddingBottom: attachmentAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 18],
                            }),
                            borderTopWidth: attachmentAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1],
                            }),
                        },
                    ]}
                    pointerEvents={showAttachmentMenu ? 'auto' : 'none'}
                >
                    <View style={styles.attachmentPanelGrid}>
                        <TouchableOpacity
                            style={styles.attachmentOption}
                            activeOpacity={0.8}
                            onPress={handlePickImage}
                        >
                            <View style={[styles.attachmentOptionIcon, styles.attachmentOptionIconBlue]}>
                                <ImageIcon size={22} color="#2563EB" />
                            </View>
                            <Text style={styles.attachmentOptionText}>相片</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.attachmentOption}
                            activeOpacity={0.8}
                            onPress={handleTakePhoto}
                        >
                            <View style={[styles.attachmentOptionIcon, styles.attachmentOptionIconSlate]}>
                                <Camera size={22} color="#475569" />
                            </View>
                            <Text style={styles.attachmentOptionText}>拍照</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.attachmentOption}
                            activeOpacity={0.8}
                            onPress={handlePickFile}
                        >
                            <View style={[styles.attachmentOptionIcon, styles.attachmentOptionIconBlue]}>
                                <FileText size={22} color="#0284C7" />
                            </View>
                            <Text style={styles.attachmentOptionText}>文件</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>

            {previewIndex !== null && previewImages[previewIndex]?.url && (
                <View style={styles.previewOverlay}>
                    <ZoomableImageCarousel
                        images={previewImages.map((item) => item.url)}
                        width={SCREEN_WIDTH}
                        height={SCREEN_HEIGHT}
                        contentFit="contain"
                        previewMode="standalone"
                        externalViewerIndex={previewIndex}
                        onViewerRequestClose={() => setPreviewIndex(null)}
                    />
                </View>
            )}
        </SafeAreaView>
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
        paddingHorizontal: 15,
        height: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: {
        padding: 5,
    },
    headerProfile: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 10,
    },
    headerAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#E5E7EB',
    },
    headerAvatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#CBD5E1',
    },
    headerAvatarFallbackText: {
        color: '#334155',
        fontSize: 16,
        fontWeight: '700',
    },
    headerInfo: {
        flex: 1,
        minWidth: 0,
        marginLeft: 12,
    },
    headerName: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
    },
    headerStatus: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    moreButton: {
        padding: 5,
    },
    content: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageList: {
        paddingVertical: 20,
        paddingHorizontal: 15,
    },
    messageListEmpty: {
        flexGrow: 1,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    messageContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        maxWidth: '85%',
    },
    myMessage: {
        alignSelf: 'flex-end',
        flexDirection: 'row-reverse',
    },
    theirMessage: {
        alignSelf: 'flex-start',
    },
    avatarMini: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E5E7EB',
        marginRight: 10,
    },
    avatarMiniFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#CBD5E1',
    },
    avatarMiniFallbackText: {
        color: '#334155',
        fontSize: 16,
        fontWeight: '700',
    },
    bubble: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 20,
        position: 'relative',
    },
    myBubble: {
        backgroundColor: '#1E3A8A',
        borderBottomRightRadius: 4,
    },
    theirBubble: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    imageBubble: {
        paddingHorizontal: 4,
        paddingVertical: 4,
        borderRadius: 18,
    },
    fileBubble: {
        paddingHorizontal: 5,
        paddingVertical: 4,
        borderRadius: 15,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    myText: {
        color: '#fff',
    },
    theirText: {
        color: '#111827',
    },
    textTimeRow: {
        alignItems: 'flex-end',
        marginTop: 2,
    },
    fileMessageButton: {
        maxWidth: 222,
        minWidth: 176,
        paddingTop: 7,
        paddingLeft: 8,
        paddingRight: 8,
        paddingBottom: 8,
        borderRadius: 12,
        position: 'relative',
    },
    myFileMessageButton: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    theirFileMessageButton: {
        backgroundColor: '#F8FAFC',
    },
    fileMessageTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    fileIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    myFileIconWrap: {
        backgroundColor: 'rgba(255,255,255,0.9)',
    },
    theirFileIconWrap: {
        backgroundColor: '#E2E8F0',
    },
    fileMeta: {
        flex: 1,
        minWidth: 0,
    },
    fileName: {
        fontSize: 12,
        lineHeight: 15,
        fontWeight: '600',
    },
    fileMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    fileTypeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
    },
    myFileTypeBadge: {
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    theirFileTypeBadge: {
        backgroundColor: '#E0E7FF',
    },
    fileTypeBadgeText: {
        fontSize: 8,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    myFileTypeBadgeText: {
        color: '#DBEAFE',
    },
    theirFileTypeBadgeText: {
        color: '#1D4ED8',
    },
    fileInlineTime: {
        fontSize: 9,
        fontWeight: '600',
        marginLeft: 8,
    },
    myFileInlineTime: {
        color: 'rgba(255,255,255,0.78)',
    },
    theirFileInlineTime: {
        color: '#94A3B8',
    },
    timeText: {
        fontSize: 10,
    },
    myTime: {
        color: 'rgba(255,255,255,0.7)',
    },
    theirTime: {
        color: '#9CA3AF',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    attachButton: {
        padding: 10,
    },
    attachButtonActive: {
        opacity: 1,
    },
    inputContainer: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 24,
        paddingHorizontal: 15,
        paddingVertical: 8,
        marginHorizontal: 8,
        maxHeight: 120,
    },
    input: {
        fontSize: 16,
        color: '#111827',
        paddingTop: 4,
        paddingBottom: 4,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#CBD5E1',
    },
    imageMessagePressable: {
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    messageImage: {
        width: 220,
        height: 220,
        borderRadius: 16,
        backgroundColor: '#E5E7EB',
    },
    imageTimeOverlay: {
        position: 'absolute',
        right: 10,
        bottom: 10,
        backgroundColor: 'rgba(17, 24, 39, 0.45)',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    imageTimeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 20,
    },
    attachmentPanel: {
        backgroundColor: '#fff',
        borderTopColor: '#E5E7EB',
        paddingHorizontal: 18,
        overflow: 'hidden',
    },
    attachmentPanelGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    attachmentOption: {
        alignItems: 'center',
        width: '33.33%',
        marginBottom: 20,
    },
    attachmentOptionIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    attachmentOptionIconBlue: {
        backgroundColor: '#DBEAFE',
    },
    attachmentOptionIconSlate: {
        backgroundColor: '#F1F5F9',
    },
    attachmentOptionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
});

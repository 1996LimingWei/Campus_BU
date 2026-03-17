import { ArrowLeft, MoreVertical, Plus, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DirectMessage, DirectMessagePeer } from '../../types';
import { getCurrentUser } from '../../services/auth';
import {
    fetchDirectMessages,
    markConversationAsRead,
    sendDirectMessage,
    subscribeToDirectConversation,
} from '../../services/messages';

const isValidUrl = (value?: string) => !!value && (value.startsWith('http://') || value.startsWith('https://'));

const formatMessageTime = (date: Date) => date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
});

export default function ChatScreen() {
    const params = useLocalSearchParams<{ id?: string | string[] }>();
    const peerUserId = Array.isArray(params.id) ? params.id[0] : params.id;
    const { t } = useTranslation();
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [peer, setPeer] = useState<DirectMessagePeer | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [inputText, setInputText] = useState('');

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
    }, [currentUser, peerUserId]);

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

    const headerSubtitle = useMemo(() => {
        if (peer?.major) {
            return peer.major;
        }
        return t('messages.offline');
    }, [peer?.major, t]);

    const renderMessage = ({ item }: { item: DirectMessage }) => {
        const isMe = item.senderId === currentUser?.uid;

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
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
                        {item.content}
                    </Text>
                    <Text style={[styles.timeText, isMe ? styles.myTime : styles.theirTime]}>
                        {formatMessageTime(item.createdAt)}
                    </Text>
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
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName} numberOfLines={1}>
                        {peer?.name || 'Chat'}
                    </Text>
                    <Text style={styles.headerStatus} numberOfLines={1}>
                        {headerSubtitle}
                    </Text>
                </View>
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
                    <TouchableOpacity style={styles.attachButton} activeOpacity={1} disabled>
                        <Plus size={24} color="#9CA3AF" />
                    </TouchableOpacity>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder={t('messages.input_placeholder')}
                            value={inputText}
                            onChangeText={setInputText}
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
            </KeyboardAvoidingView>
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
    headerInfo: {
        flex: 1,
        minWidth: 0,
        marginLeft: 15,
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
    timeText: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
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
        opacity: 0.5,
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
});

import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bot, Send, Sparkles, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runDailyDigestJobForUser } from '../../services/agent/dailyDigest';
import { AgentExecutor } from '../../services/agent/executor';
import { AgentStep } from '../../services/agent/types';
import { getCurrentUser } from '../../services/auth';
import { GuestLoginModal } from '../common/GuestLoginModal';

interface AgentChatScreenProps {
    showBackButton?: boolean;
}

function TypingDots() {
    const dot1 = useRef(new Animated.Value(0.35)).current;
    const dot2 = useRef(new Animated.Value(0.35)).current;
    const dot3 = useRef(new Animated.Value(0.35)).current;

    useEffect(() => {
        const makeLoop = (target: Animated.Value, delay: number) => Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(target, {
                    toValue: 1,
                    duration: 360,
                    useNativeDriver: true,
                }),
                Animated.timing(target, {
                    toValue: 0.35,
                    duration: 360,
                    useNativeDriver: true,
                }),
            ])
        );

        const animations = [
            makeLoop(dot1, 0),
            makeLoop(dot2, 140),
            makeLoop(dot3, 280),
        ];

        animations.forEach(animation => animation.start());
        return () => animations.forEach(animation => animation.stop());
    }, [dot1, dot2, dot3]);

    return (
        <View style={styles.typingDots}>
            {[dot1, dot2, dot3].map((value, index) => (
                <Animated.View
                    key={index}
                    style={[
                        styles.typingDot,
                        {
                            opacity: value,
                            transform: [{
                                translateY: value.interpolate({
                                    inputRange: [0.35, 1],
                                    outputRange: [2, -2],
                                }),
                            }],
                        },
                    ]}
                />
            ))}
        </View>
    );
}

const shouldUseCurrentLocation = (input: string): boolean => {
    const text = input.trim().toLowerCase();
    if (!text) return false;

    return /附近|最近|离我最近|離我最近|near me|nearest|around me|我在哪|我在哪儿|我在哪裡|where am i|current location|当前位置|當前位置|最近的建筑|最近的建築|最近的餐厅|最近的餐廳|nearest building|nearest restaurant/i.test(text);
};

export default function AgentChatScreen({ showBackButton = false }: AgentChatScreenProps) {
    const router = useRouter();
    const params = useLocalSearchParams<{ digestDate?: string }>();
    const insets = useSafeAreaInsets();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<{
        role: 'user' | 'assistant',
        content: string,
        steps?: AgentStep[],
        quickReplies?: string[],
        id?: string
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loadingSession, setLoadingSession] = useState(true);
    const [showGuestModal, setShowGuestModal] = useState(false);
    const [deviceLocation, setDeviceLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const { t } = useTranslation();
    const scrollViewRef = useRef<ScrollView>(null);
    const agentRef = useRef<AgentExecutor>(new AgentExecutor('guest-session'));

    const parseDigestDateParam = (value?: string): Date | null => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return null;
        }
        const parsed = new Date(`${value}T00:00:00+08:00`);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return parsed;
    };

    useEffect(() => {
        const userId = currentUser?.uid || 'guest-session';
        agentRef.current = new AgentExecutor(userId);
        agentRef.current.setDeviceLocation(deviceLocation);
    }, [currentUser?.uid]);

    useEffect(() => {
        let cancelled = false;

        async function injectDailyDigest() {
            if (!currentUser?.uid) {
                return;
            }

            try {
                const preferredDate = parseDigestDateParam(
                    Array.isArray(params.digestDate) ? params.digestDate[0] : params.digestDate
                );
                const result = preferredDate
                    ? await runDailyDigestJobForUser(currentUser.uid, preferredDate)
                    : await runDailyDigestJobForUser(currentUser.uid);
                if (!result.ok || !result.payload || cancelled) {
                    return;
                }

                const payload = result.payload;
                const digestMessageId = `daily-digest-${payload.date}`;
                setMessages((prev) => {
                    if (prev.some((message) => message.id === digestMessageId)) {
                        return prev;
                    }

                    return [
                        ...prev,
                        {
                            role: 'assistant',
                            content: payload.message,
                            id: digestMessageId,
                        },
                    ];
                });
                scrollViewRef.current?.scrollToEnd({ animated: true });
            } catch (error) {
                console.warn('[AgentChat] Failed to inject daily digest message:', error);
            }
        }

        void injectDailyDigest();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.uid, params.digestDate]);

    useEffect(() => {
        agentRef.current.setDeviceLocation(deviceLocation);
    }, [deviceLocation]);

    const ensureCurrentLocation = async () => {
        if (deviceLocation) {
            return deviceLocation;
        }

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                return null;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const coords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };

            setDeviceLocation(coords);
            return coords;
        } catch (error) {
            console.warn('[AgentChat] Failed to get current location:', error);
            return null;
        }
    };

    const handleBackPress = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/(tabs)/campus');
    };

    useEffect(() => {
        async function loadSession() {
            setLoadingSession(true);
            const user = await getCurrentUser();
            setCurrentUser(user);
            setLoadingSession(false);
        }
        loadSession();
    }, []);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleSend = async (overrideText?: string) => {
        if (!loadingSession && !currentUser) {
            setShowGuestModal(true);
            return;
        }

        const textToSend = overrideText || input;
        if (!textToSend.trim() || loading) return;

        const userMsg = textToSend.trim();
        if (!overrideText) setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            if (shouldUseCurrentLocation(userMsg)) {
                const coords = await ensureCurrentLocation();
                agentRef.current.setDeviceLocation(coords);
            }
            const streamId = Date.now().toString();
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '',
                id: streamId
            }]);

            const onUpdate = (text: string) => {
                setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: text || '...' } : m));
                scrollViewRef.current?.scrollToEnd({ animated: false });
            };

            const response = await agentRef.current.process(userMsg, onUpdate);

            setMessages(prev => prev.map(m => m.id === streamId ? {
                ...m,
                content: response.finalAnswer || m.content,
                steps: response.steps,
                quickReplies: response.quickReplies
            } : m));
        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `抱歉，我现在遇到了一点问题：${error.message || '未知错误'}`
            }]);
        } finally {
            setLoading(false);
        }
    };

    const bottomComposerOffset = showBackButton
        ? Math.max(insets.bottom, 16)
        : keyboardVisible
            ? Math.max(insets.bottom, 4)
            : Math.max(insets.bottom + 68, 76);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={0}
        >
            <View style={[styles.headerShell, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
                <View style={styles.headerTopRow}>
                    {showBackButton ? (
                        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
                            <ArrowLeft size={18} color="#1E3A8A" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backSpacer} />
                    )}
                    <View style={styles.headerTitleGroup}>
                        <View style={styles.headerAgentBadge}>
                            <Bot size={22} color="#1E3A8A" />
                        </View>
                        <View>
                            <Text style={styles.headerTitle}>Campus Agent</Text>
                            <Text style={styles.headerSubtitle}>校园信息助手</Text>
                        </View>
                    </View>
                    <View style={styles.headerActions} />
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                style={styles.chatContainer}
                contentContainerStyle={[
                    styles.chatContent,
                    { paddingBottom: bottomComposerOffset + 12 }
                ]}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                <View style={styles.welcomeCard}>
                    <Sparkles size={32} color="#1E3A8A" />
                    <Text style={styles.welcomeTitle}>你好！我是创新实验室校园生活 Agent</Text>
                    <Text style={styles.welcomeText}>
                        我可以帮你查关于HKBU的任何问题，尽管来问我吧！你可以试着问我：
                    </Text>
                    <View style={styles.suggestions}>
                        <TouchableOpacity style={styles.suggestion} onPress={() => handleSend('期末考试的A、B、C分别对应多少绩点？')}>
                            <Text style={styles.suggestionText}>“期末考试的A、B、C分别对应多少绩点？”</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.suggestion} onPress={() => handleSend('我的课表里面有什么')}>
                            <Text style={styles.suggestionText}>“我的课表里面有什么”</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {messages.map((msg, index) => (
                    <View key={index} style={[
                        styles.messageWrapper,
                        msg.role === 'user' ? styles.userWrapper : styles.botWrapper
                    ]}>
                        <View style={styles.avatarWrapper}>
                            {msg.role === 'user' ? (
                                <View style={[styles.avatar, { backgroundColor: '#E5E7EB' }]}>
                                    <User size={16} color="#6B7280" />
                                </View>
                            ) : (
                                <View style={[styles.avatar, { backgroundColor: '#1E3A8A' }]}>
                                    <Bot size={16} color="#fff" />
                                </View>
                            )}
                        </View>
                        <View style={styles.messageContent}>
                            <View style={[
                                styles.bubble,
                                msg.role === 'user' ? styles.userBubble : styles.botBubble
                            ]}>
                                <View style={styles.messageContentWrapper}>
                                    {msg.role === 'assistant' ? (
                                        msg.content === '' ? (
                                            <TypingDots />
                                        ) : (
                                            renderFormattedText(msg.content, false)
                                        )
                                    ) : (
                                        renderFormattedText(msg.content, true)
                                    )}
                                </View>
                            </View>

                            {msg.quickReplies && msg.quickReplies.length > 0 && (
                                <View style={styles.quickRepliesContainer}>
                                    {msg.quickReplies.map((qr, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={styles.quickReplyButton}
                                            onPress={() => handleSend(qr)}
                                        >
                                            <Text style={styles.quickReplyText}>{qr}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>
                ))}
            </ScrollView>

            <View style={[styles.inputArea, { paddingBottom: bottomComposerOffset }]}>
                <View style={styles.inputShell}>
                    <TextInput
                        style={styles.input}
                        placeholder="输入指令..."
                        value={input}
                        onChangeText={setInput}
                        multiline
                    />
                </View>
                <TouchableOpacity
                    style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
                    onPress={() => handleSend()}
                    disabled={!input.trim() || loading}
                >
                    <Send size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            <GuestLoginModal
                visible={showGuestModal}
                onClose={() => setShowGuestModal(false)}
            />
        </KeyboardAvoidingView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    headerShell: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F2F8',
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 0,
        paddingRight: 2,
        paddingVertical: 4,
    },
    headerTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
        marginLeft: 0,
    },
    headerAgentBadge: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButton: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#F0F2F8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backSpacer: {
        width: 32,
        height: 32,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 12,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: '#F3F4F6',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        color: '#4B5563',
    },
    chatContainer: {
        flex: 1,
    },
    chatContent: {
        padding: 20,
    },
    welcomeCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    welcomeTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1E3A8A',
        marginTop: 12,
    },
    welcomeText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    suggestions: {
        marginTop: 16,
        width: '100%',
        gap: 8,
    },
    suggestion: {
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    suggestionText: {
        fontSize: 13,
        color: '#4B5563',
        textAlign: 'center',
    },
    messageWrapper: {
        flexDirection: 'row',
        marginBottom: 20,
        maxWidth: '85%',
    },
    userWrapper: {
        alignSelf: 'flex-end',
        flexDirection: 'row-reverse',
    },
    botWrapper: {
        alignSelf: 'flex-start',
    },
    avatarWrapper: {
        marginTop: 4,
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageContent: {
        marginHorizontal: 12,
    },
    bubble: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 18,
    },
    userBubble: {
        backgroundColor: '#1E3A8A',
        borderTopRightRadius: 4,
    },
    botBubble: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    messageContentWrapper: {
        minHeight: 24,
        justifyContent: 'center',
    },
    inputArea: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        alignItems: 'flex-end',
    },
    inputShell: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        paddingLeft: 16,
        paddingRight: 16,
    },
    input: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingTop: 10,
        paddingBottom: 10,
        maxHeight: 120,
        fontSize: 15,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    sendButtonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    quickRepliesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        gap: 8,
    },
    quickReplyButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#1E3A8A',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    quickReplyText: {
        color: '#1E3A8A',
        fontSize: 13,
        fontWeight: '500',
    },
    assistantSelectableText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#1F2937',
        padding: 0,
        margin: 0,
        includeFontPadding: false,
    },
    inlineLink: {
        color: '#1D4ED8',
        textDecorationLine: 'underline',
        fontWeight: '600',
    },
    inlineLinkUser: {
        color: '#DBEAFE',
        textDecorationLine: 'underline',
        fontWeight: '600',
    },
    typingDots: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 24,
        paddingVertical: 2,
    },
    typingDot: {
        width: 7,
        height: 7,
        borderRadius: 999,
        backgroundColor: '#1E3A8A',
    },
});

function renderFormattedText(text: string, isUser: boolean = false) {
    if (!text) return null;
    const lines = text.split('\n');
    const textColor = isUser ? '#fff' : '#1F2937';
    const tokenRegex = /(【\d+】\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s]+)/g;

    const openUrl = async (url: string) => {
        try {
            const canOpen = await Linking.canOpenURL(url);
            if (!canOpen) {
                return;
            }
            await Linking.openURL(url);
        } catch (error) {
            console.warn('[AgentChat] Failed to open url:', error);
        }
    };

    const renderTextWithBold = (segmentText: string, lineKey: number): React.ReactNode[] => {
        const boldRegex = /\*\*(.*?)\*\*/g;
        const segments: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null = boldRegex.exec(segmentText);

        while (match) {
            if (match.index > lastIndex) {
                segments.push(segmentText.substring(lastIndex, match.index));
            }

            segments.push(
                <Text key={`bold-${lineKey}-${match.index}`} style={{ fontWeight: 'bold', color: textColor }}>
                    {match[1]}
                </Text>
            );

            lastIndex = boldRegex.lastIndex;
            match = boldRegex.exec(segmentText);
        }

        if (lastIndex < segmentText.length) {
            segments.push(segmentText.substring(lastIndex));
        }

        return segments.length > 0 ? segments : [segmentText];
    };

    return (
        <Text selectable style={{ fontSize: 15, color: textColor, lineHeight: 22 }}>
            {lines.map((line, i) => {
                const displayLine = line.trim().startsWith('- ') || line.trim().startsWith('* ')
                    ? `• ${line.trim().substring(2)}`
                    : line;

                const renderedParts: React.ReactNode[] = [];
                let lastIndex = 0;
                let match: RegExpExecArray | null = tokenRegex.exec(displayLine);

                while (match) {
                    if (match.index > lastIndex) {
                        renderedParts.push(...renderTextWithBold(displayLine.slice(lastIndex, match.index), i * 100 + lastIndex));
                    }

                    const fullMatch = match[0];
                    const referenceUrl = match[2];
                    const href = referenceUrl || fullMatch;
                    const label = referenceUrl ? fullMatch.slice(0, fullMatch.indexOf('(')) : fullMatch;

                    renderedParts.push(
                        <Text
                            key={`link-${i}-${match.index}`}
                            style={isUser ? styles.inlineLinkUser : styles.inlineLink}
                            onPress={() => {
                                void openUrl(href);
                            }}
                        >
                            {label}
                        </Text>
                    );

                    lastIndex = match.index + fullMatch.length;
                    match = tokenRegex.exec(displayLine);
                }

                if (lastIndex < displayLine.length) {
                    renderedParts.push(...renderTextWithBold(displayLine.slice(lastIndex), i * 100 + lastIndex));
                }

                return (
                    <React.Fragment key={i}>
                        {renderedParts.length > 0 ? renderedParts : displayLine}
                        {i < lines.length - 1 ? '\n' : ''}
                    </React.Fragment>
                );
            })}
        </Text>
    );
}

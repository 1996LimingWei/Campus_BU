import { useRouter } from 'expo-router';
import { ArrowLeft, Bot, Send, Sparkles, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { APP_CONFIG } from '../../constants/Config';
import { agentBridge } from '../../services/agent/bridge';
import { AgentExecutor } from '../../services/agent/executor';
import { getCookieInjectionScript } from '../../services/agent/session';
import { AgentStep } from '../../services/agent/types';
import { getCurrentUser } from '../../services/auth';

export default function AgentChatScreen() {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<{
        role: 'user' | 'assistant',
        content: string,
        steps?: AgentStep[],
        quickReplies?: string[],
        id?: string
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [showWebView, setShowWebView] = useState(false);
    const [useLangGraph, setUseLangGraph] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const webViewRef = useRef<WebView>(null);
    const agentRef = useRef<AgentExecutor>(new AgentExecutor('demo-user'));
    const langGraphAgentRef = useRef<any>(null); // Will be initialized dynamically
    const [cookieScript, setCookieScript] = useState('');
    const [webViewUrl, setWebViewUrl] = useState('https://library.hkbu.edu.hk/');

    useEffect(() => {
        async function loadSession() {
            const user = await getCurrentUser();
            setCurrentUser(user);
            const script = await getCookieInjectionScript();
            setCookieScript(script);
        }
        loadSession();
    }, []);

    useEffect(() => {
        // Always connect bridge to WebView when available
        if (webViewRef.current) {
            agentBridge.setWebView(webViewRef as unknown as React.RefObject<WebView>);
        }
    });

    // Wire LangGraph callbacks for WebView control & real-time message push
    useEffect(() => {
        const setupLangGraphCallbacks = async () => {
            if (useLangGraph) {
                try {
                    // Dynamically import and initialize LangGraphExecutor only when needed
                    const { LangGraphExecutor } = await import('../../services/agent/langgraph_executor');
                    if (!langGraphAgentRef.current) {
                        langGraphAgentRef.current = new LangGraphExecutor('demo-user');
                    }

                    if (langGraphAgentRef.current) {
                        langGraphAgentRef.current.setCallbacks({
                            onShowWebView: () => setShowWebView(true),
                            onHideWebView: () => setShowWebView(false),
                            onNavigateWebView: (url: string) => setWebViewUrl(url),
                            onPushMessage: (content: string, quickReplies?: string[]) => {
                                // Push a real-time assistant message into the chat
                                setMessages(prev => [...prev, {
                                    role: 'assistant' as const,
                                    content,
                                    quickReplies,
                                }]);
                                // Auto-scroll
                                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                            },
                        });
                    }
                } catch (error) {
                    console.error('Failed to load LangGraphExecutor:', error);
                }
            }
        };

        setupLangGraphCallbacks();
    }, [useLangGraph]);

    const handleSend = async (overrideText?: string) => {
        const textToSend = overrideText || input;
        if (!textToSend.trim() || loading) return;

        const userMsg = textToSend.trim();
        if (!overrideText) setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            let response: any;
            if (useLangGraph) {
                console.log('[Agent] Using LangGraph Pilot...');
                if (!langGraphAgentRef.current) {
                    const { LangGraphExecutor } = await import('../../services/agent/langgraph_executor');
                    langGraphAgentRef.current = new LangGraphExecutor('demo-user');
                }
                response = await langGraphAgentRef.current.process(userMsg);

                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: response.finalAnswer || '',
                    steps: response.steps,
                    quickReplies: response.quickReplies
                }]);
            } else {
                const streamId = Date.now().toString();
                // Insert a placeholder message that will be updated in real-time
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: '', // Start empty
                    id: streamId
                }]);

                const onUpdate = (text: string) => {
                    setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: text || '...' } : m));
                    // Auto-scroll slightly while typing
                    scrollViewRef.current?.scrollToEnd({ animated: false });
                };

                response = await agentRef.current.process(userMsg, onUpdate);

                // Finalize the message with any quick replies or step metadata if needed
                setMessages(prev => prev.map(m => m.id === streamId ? {
                    ...m,
                    content: response.finalAnswer || m.content,
                    steps: response.steps,
                    quickReplies: response.quickReplies
                } : m));
            }

        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `抱歉，我现在遇到了一点问题：${error.message || '未知错误'}`
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#1E3A8A" />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle}>校园生活 Agent</Text>
                    {APP_CONFIG.shouldShowDebug(currentUser?.uid) && (
                        <View style={styles.statusRow}>
                            <View style={styles.statusDot} />
                            <Text style={styles.statusText}>AI 实验室 {useLangGraph ? '(LG)' : ''}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.headerActions}>
                    {APP_CONFIG.shouldShowDebug(currentUser?.uid) && (
                        <>
                            <TouchableOpacity onPress={() => {
                                setUseLangGraph(!useLangGraph);
                                setMessages(prev => [...prev, {
                                    role: 'assistant',
                                    content: `已切换至 ${!useLangGraph ? 'LangGraph (Pilot)' : '标准引擎'}`
                                }]);
                            }} style={[styles.pilotButton, useLangGraph && styles.pilotButtonActive]}>
                                <Text style={[styles.pilotButtonText, useLangGraph && styles.pilotButtonTextActive]}>PILOT</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowWebView(!showWebView)} style={styles.debugButton}>
                                <Bot size={20} color={showWebView ? '#3B82F6' : '#6B7280'} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                style={styles.chatContainer}
                contentContainerStyle={styles.chatContent}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                <View style={styles.welcomeCard}>
                    <Sparkles size={32} color="#1E3A8A" />
                    <Text style={styles.welcomeTitle}>你好！我是你的 AI 助手</Text>
                    <Text style={styles.welcomeText}>
                        我可以帮你查图书馆位子、搜食堂美食，还可以记住你的偏好。你可以试着问我：
                    </Text>
                    <View style={styles.suggestions}>
                        <TouchableOpacity style={styles.suggestion} onPress={() => handleSend('推荐一下附近好吃的')}>
                            <Text style={styles.suggestionText}>“推荐一下附近好吃的”</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.suggestion} onPress={() => handleSend('图书馆还有位子吗？')}>
                            <Text style={styles.suggestionText}>“图书馆还有位子吗？”</Text>
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
                                            <ActivityIndicator size="small" color="#1E3A8A" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
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

            <View style={styles.inputArea}>
                <TextInput
                    style={styles.input}
                    placeholder="输入指令..."
                    value={input}
                    onChangeText={setInput}
                    multiline
                />
                <TouchableOpacity
                    style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
                    onPress={() => handleSend()}
                    disabled={!input.trim() || loading}
                >
                    <Send size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* WebView - Always Mounted for agentBridge, Visible when showWebView=true for SSO Login */}
            <View style={showWebView ? styles.webviewVisible : styles.webviewHidden}>
                {showWebView && (
                    <TouchableOpacity style={styles.webviewCloseBtn} onPress={() => setShowWebView(false)}>
                        <Text style={styles.webviewCloseBtnText}>收起页面 ▼</Text>
                    </TouchableOpacity>
                )}
                <WebView
                    ref={webViewRef}
                    source={{ uri: webViewUrl }}
                    style={{ flex: 1 }}
                    onMessage={(e) => agentBridge.handleMessage(e)}
                    injectedJavaScriptBeforeContentLoaded={cookieScript}
                    injectedJavaScript={`
                        // Minimal: ensure cookies are synced
                        document.cookie && window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                            JSON.stringify({ type: 'COOKIES', payload: { cookies: document.cookie } })
                        );
                        true;
                    `}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    sharedCookiesEnabled={true}
                    thirdPartyCookiesEnabled={true}
                    setSupportMultipleWindows={false}
                    mixedContentMode="compatibility"
                    userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    startInLoadingState={true}
                    allowsBackForwardNavigationGestures={true}
                    onShouldStartLoadWithRequest={(request) => {
                        // Allow all navigations including SSO redirects
                        console.log('[WebView] Navigating to:', request.url);
                        return true;
                    }}
                />
            </View>
        </KeyboardAvoidingView >
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
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: {
        padding: 4,
    },
    headerInfo: {
        marginLeft: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
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
        color: '#6B7280',
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
    messageText: {
        fontSize: 15,
        lineHeight: 22,
    },
    userText: {
        color: '#fff',
    },
    botText: {
        color: '#1F2937',
    },
    loadingBubble: {
        marginLeft: 12,
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 18,
        borderTopLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    stepsContainer: {
        marginTop: 8,
        marginLeft: 4,
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: '#E5E7EB',
    },
    stepItem: {
        marginBottom: 8,
    },
    stepIndicator: {
        position: 'absolute',
        left: -15,
        top: 6,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#9CA3AF',
    },
    stepThought: {
        fontSize: 12,
        color: '#6B7280',
        fontStyle: 'italic',
    },
    stepAction: {
        fontSize: 11,
        color: '#1E3A8A',
        fontWeight: 'bold',
        marginTop: 2,
    },
    inputArea: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        paddingHorizontal: 16,
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
    webviewVisible: {
        height: '40%',
        borderTopWidth: 2,
        borderTopColor: '#1E3A8A',
        backgroundColor: '#fff',
    },
    webviewHidden: {
        position: 'absolute',
        width: 300,
        height: 300,
        opacity: 0,
        left: -9999,
    },
    webviewCloseBtn: {
        backgroundColor: '#1E3A8A',
        paddingVertical: 6,
        alignItems: 'center',
    },
    webviewCloseBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    actionButton: {
        marginTop: 8,
        backgroundColor: '#DBEAFE',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3B82F6',
        alignSelf: 'flex-start',
    },
    actionButtonText: {
        fontSize: 12,
        color: '#1E3A8A',
        fontWeight: 'bold',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pilotButton: {
        marginRight: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    pilotButtonActive: {
        backgroundColor: '#1E3A8A',
        borderColor: '#1E3A8A',
    },
    pilotButtonText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#6B7280',
    },
    pilotButtonTextActive: {
        color: '#fff',
    },
    debugButton: {
        padding: 4,
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
    confirmBookingButton: {
        backgroundColor: '#059669', // Emerald 600
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 8,
        alignItems: 'center',
    },
    confirmBookingText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
});

/**
 * Helper to render basic Markdown
 */
function renderFormattedText(text: string, isUser: boolean = false) {
    if (!text) return null;
    const lines = text.split('\n');
    const textColor = isUser ? '#fff' : '#1F2937';

    return lines.map((line, i) => {
        // Bullet points
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            return (
                <View key={i} style={{ flexDirection: 'row', paddingLeft: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, marginRight: 6, color: textColor }}>•</Text>
                    <Text style={{ fontSize: 15, color: textColor, flex: 1 }}>{line.trim().substring(2)}</Text>
                </View>
            );
        }
        // Bold
        const boldRegex = /\*\*(.*?)\*\*/g;
        let parts = [];
        let lastIndex = 0;
        let match;
        while ((match = boldRegex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                parts.push(line.substring(lastIndex, match.index));
            }
            parts.push(<Text key={match.index} style={{ fontWeight: 'bold', color: textColor }}>{match[1]}</Text>);
            lastIndex = boldRegex.lastIndex;
        }
        if (lastIndex < line.length) {
            parts.push(line.substring(lastIndex));
        }

        return (
            <Text key={i} style={{ fontSize: 15, color: textColor, marginBottom: 4 }}>
                {parts.length > 0 ? parts : line}
            </Text>
        );
    });
}


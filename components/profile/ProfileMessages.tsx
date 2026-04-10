import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react-native';
import { CachedRemoteImage } from '../common/CachedRemoteImage';
import { DirectConversationSummary } from '../../types';
import { getCurrentUser } from '../../services/auth';
import { fetchDirectConversations, subscribeToDirectConversationList } from '../../services/messages';
import { isRemoteImageUrl } from '../../utils/remoteImage';

const formatConversationTimestamp = (date: Date, t: (key: string, options?: any) => string) => {
    const now = Date.now();
    const diffMinutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));

    if (diffMinutes < 1) {
        return t('messages.just_now');
    }

    if (diffMinutes < 60) {
        return t('messages.minutes_ago', { count: diffMinutes });
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return t('messages.hours_ago', { count: diffHours });
    }

    return `${date.getMonth() + 1}/${date.getDate()}`;
};

export const ProfileMessages: React.FC = () => {
    const { t } = useTranslation();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);
    const SHARE_CARD_PREVIEW_MARKER = '[share_card]';

    const localizePreviewText = useCallback((text?: string) => {
        if (!text) {
            return '';
        }
        if (text === SHARE_CARD_PREVIEW_MARKER) {
            return t('messages.share_card_preview', '【分享卡片】');
        }
        return text;
    }, [t]);

    const loadConversations = useCallback(async (silent = false) => {
        try {
            if (!silent) {
                setLoading(true);
            }

            const user = await getCurrentUser();
            setCurrentUserId(user?.uid || null);
            if (!user?.uid) {
                setConversations([]);
                return;
            }

            const data = await fetchDirectConversations(user.uid);
            setConversations(data);
        } catch (error) {
            console.error('Error loading conversations:', error);
            setConversations([]);
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        let active = true;
        let unsubscribe: (() => void) | undefined;

        const load = async () => {
            try {
                const user = await getCurrentUser();
                if (!active) return;

                setCurrentUserId(user?.uid || null);
                if (!user?.uid) {
                    setConversations([]);
                    return;
                }

                const data = await fetchDirectConversations(user.uid);
                if (!active) return;
                setConversations(data);

                unsubscribe = subscribeToDirectConversationList(user.uid, async () => {
                    try {
                        const refreshed = await fetchDirectConversations(user.uid);
                        if (active) {
                            setConversations(refreshed);
                        }
                    } catch (error) {
                        console.error('Error refreshing conversations:', error);
                    }
                });
            } catch (error) {
                console.error('Error loading conversations:', error);
                if (active) {
                    setConversations([]);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            active = false;
            unsubscribe?.();
        };
    }, []);

    const filteredConversations = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) {
            return conversations;
        }

        return conversations.filter((conversation) => {
            const major = conversation.user.major || '';
            const localizedLastMessage = localizePreviewText(conversation.lastMessage);
            return conversation.user.name.toLowerCase().includes(keyword)
                || major.toLowerCase().includes(keyword)
                || localizedLastMessage.toLowerCase().includes(keyword);
        });
    }, [conversations, localizePreviewText, search]);

    const handleOpenConversation = useCallback((item: DirectConversationSummary) => {
        setConversations((previous) => previous.map((conversation) => (
            conversation.id === item.id
                ? { ...conversation, unreadCount: 0 }
                : conversation
        )));
        router.push({ pathname: '/messages/[id]' as any, params: { id: item.user.id } });
    }, [router]);

    const renderItem = ({ item }: { item: DirectConversationSummary }) => (
        <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => handleOpenConversation(item)}
            activeOpacity={0.7}
        >
            <View style={styles.avatarContainer}>
                {isRemoteImageUrl(item.user.avatar) ? (
                    <CachedRemoteImage uri={item.user.avatar} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>
                            {item.user.name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}
            </View>
            <View style={styles.content}>
                <View style={styles.headerRow}>
                    <View style={styles.nameBlock}>
                        <Text style={styles.name} numberOfLines={1}>{item.user.name}</Text>
                        {!!item.user.major && (
                            <Text style={styles.major} numberOfLines={1}>{item.user.major}</Text>
                        )}
                    </View>
                    <Text style={styles.timestamp}>
                        {formatConversationTimestamp(item.timestamp, t)}
                    </Text>
                </View>
                <View style={styles.messageRow}>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                        {localizePreviewText(item.lastMessage) || t('messages.say_hi')}
                    </Text>
                    {item.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchWrapper}>
                <View style={styles.searchContainer}>
                    <Search size={18} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('common.search_placeholder')}
                        value={search}
                        onChangeText={setSearch}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#1E3A8A" />
                </View>
            ) : (
                <FlatList
                    data={filteredConversations}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {currentUserId ? t('messages.no_messages') : t('messages.title')}
                            </Text>
                            <Text style={styles.emptySubtext}>{t('messages.say_hi')}</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    searchWrapper: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        color: '#111827',
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingBottom: 20,
    },
    conversationItem: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 15,
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#F3F4F6',
    },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1E3A8A',
    },
    avatarFallbackText: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    content: {
        flex: 1,
        minWidth: 0,
        marginLeft: 15,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        gap: 12,
    },
    nameBlock: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
    },
    major: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    timestamp: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    messageRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    lastMessage: {
        flex: 1,
        fontSize: 14,
        color: '#6B7280',
    },
    unreadBadge: {
        backgroundColor: '#1E3A8A',
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    unreadText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    emptyContainer: {
        marginTop: 60,
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#374151',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
    },
});

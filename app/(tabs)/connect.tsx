import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getCurrentUser } from '../../services/auth';
import { getDiscoverableUsers } from '../../services/social';
import { User } from '../../types';

const { width } = Dimensions.get('window');

type DiscoverableUser = Omit<User, 'createdAt'>;

const isValidUrl = (value?: string) => !!value && (value.startsWith('http://') || value.startsWith('https://'));

const getCardColor = (uid: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#3B82F6', '#10B981', '#F59E0B', '#D97706'];
    const index = uid.charCodeAt(uid.length - 1) % colors.length;
    return colors[index];
};

export default function ConnectScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<DiscoverableUser[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        let active = true;

        const loadUsers = async () => {
            try {
                setLoading(true);
                const currentUser = await getCurrentUser();

                if (!active) return;
                if (!currentUser?.uid) {
                    setUsers([]);
                    return;
                }

                const data = await getDiscoverableUsers(currentUser.uid);
                if (!active) return;

                setUsers(data);
                setCurrentIndex(0);
            } catch (error) {
                console.error('Error loading discoverable users:', error);
                if (active) {
                    setUsers([]);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadUsers();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (currentIndex > Math.max(0, users.length - 1)) {
            setCurrentIndex(Math.max(0, users.length - 1));
        }
    }, [currentIndex, users.length]);

    const currentUser = users[currentIndex];
    const currentColor = useMemo(
        () => currentUser ? getCardColor(currentUser.uid) : '#1E3A8A',
        [currentUser]
    );

    const handlePoke = (user: DiscoverableUser) => {
        Alert.alert('Poke', `已向 ${user.displayName} 打招呼`);
    };

    const handleWave = (user: DiscoverableUser) => {
        Alert.alert('Wave', `已向 ${user.displayName} 挥手`);
    };

    const handleChat = (user: DiscoverableUser) => {
        router.push({ pathname: '/messages/[id]' as any, params: { id: user.uid } });
    };

    const handleOpenProfile = (user: DiscoverableUser) => {
        router.push({ pathname: '/profile/[id]' as any, params: { id: user.uid } });
    };

    const nextUser = () => {
        if (currentIndex < users.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const prevUser = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Connect</Text>
                <Text style={styles.headerSubtitle}>Find your vibe tribe</Text>
            </View>

            <View style={styles.statsBar}>
                <Text style={styles.statsText}>🎯 {users.length} users available</Text>
            </View>

            <View style={styles.cardContainer}>
                {loading ? (
                    <View style={styles.loadingCard}>
                        <ActivityIndicator size="small" color="#1E3A8A" />
                    </View>
                ) : !currentUser ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>No users yet</Text>
                        <Text style={styles.emptySubtitle}>完成注册的同学会出现在这里</Text>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity
                            style={[styles.card, { backgroundColor: currentColor }]}
                            activeOpacity={0.92}
                            onPress={() => handleOpenProfile(currentUser)}
                        >
                            {isValidUrl(currentUser.avatarUrl) ? (
                                <Image source={{ uri: currentUser.avatarUrl }} style={styles.avatarImage} />
                            ) : (
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>{currentUser.displayName.charAt(0).toUpperCase()}</Text>
                                </View>
                            )}
                            <Text style={styles.userName}>{currentUser.displayName}</Text>
                            <Text style={styles.userMajor}>{currentUser.major || 'Student'}</Text>
                            <Text style={styles.userDistance}>点击卡片查看主页</Text>
                        </TouchableOpacity>

                        <View style={styles.navContainer}>
                            <TouchableOpacity
                                style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
                                onPress={prevUser}
                                disabled={currentIndex === 0}
                            >
                                <ChevronLeft size={24} color={currentIndex === 0 ? '#ccc' : '#4B0082'} />
                            </TouchableOpacity>
                            <Text style={styles.navText}>{currentIndex + 1} / {users.length}</Text>
                            <TouchableOpacity
                                style={[styles.navButton, currentIndex === users.length - 1 && styles.navButtonDisabled]}
                                onPress={nextUser}
                                disabled={currentIndex === users.length - 1}
                            >
                                <ChevronRight size={24} color={currentIndex === users.length - 1 ? '#ccc' : '#4B0082'} />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            {!!currentUser && (
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handlePoke(currentUser)}>
                        <Text style={styles.actionEmoji}>👆</Text>
                        <Text style={styles.actionLabel}>Poke</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.waveButton]} onPress={() => handleWave(currentUser)}>
                        <Text style={styles.actionEmoji}>👋</Text>
                        <Text style={styles.actionLabel}>Wave</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.chatButton]} onPress={() => handleChat(currentUser)}>
                        <MessageCircle size={24} color="#fff" />
                        <Text style={[styles.actionLabel, styles.chatLabel]}>Chat</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={styles.hint}>← Swipe to discover more →</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        paddingTop: 56,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 4,
    },
    statsBar: {
        backgroundColor: '#fff',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    statsText: {
        fontSize: 14,
        color: '#4B5563',
    },
    cardContainer: {
        flex: 1,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingCard: {
        width: width - 60,
        minHeight: 280,
        borderRadius: 24,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyCard: {
        width: width - 60,
        minHeight: 280,
        borderRadius: 24,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    emptySubtitle: {
        marginTop: 8,
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    card: {
        width: width - 60,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatarImage: {
        width: 80,
        height: 80,
        borderRadius: 40,
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
    },
    userName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    userMajor: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 8,
    },
    userDistance: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.75)',
        marginBottom: 16,
    },
    navContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
    },
    navButton: {
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    navButtonDisabled: {
        opacity: 0.5,
    },
    navText: {
        fontSize: 14,
        color: '#6B7280',
        marginHorizontal: 20,
    },
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 16,
    },
    actionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        backgroundColor: '#fff',
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    waveButton: {
        backgroundColor: '#FFE66D',
    },
    chatButton: {
        backgroundColor: '#1E3A8A',
    },
    actionEmoji: {
        fontSize: 24,
        marginBottom: 4,
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
    },
    chatLabel: {
        color: '#fff',
    },
    hint: {
        textAlign: 'center',
        fontSize: 12,
        color: '#9CA3AF',
        paddingBottom: 100,
    },
});

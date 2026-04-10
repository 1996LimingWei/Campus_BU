import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CachedRemoteImage } from '../../components/common/CachedRemoteImage';
import { getCurrentUser } from '../../services/auth';
import { BlockedUserProfile, fetchBlockedUsers, unblockUser } from '../../services/moderation';
import { isRemoteImageUrl } from '../../utils/remoteImage';

export default function BlockedUsersScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [rows, setRows] = useState<BlockedUserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const currentUser = await getCurrentUser();
            if (!currentUser?.uid) {
                setCurrentUserId(null);
                setRows([]);
                return;
            }

            setCurrentUserId(currentUser.uid);
            const blockedUsers = await fetchBlockedUsers(currentUser.uid);
            setRows(blockedUsers);
        } catch (error) {
            console.error('Error loading blocked users:', error);
            Alert.alert(
                t('common.error', 'Error'),
                t('profile.blocked_users_load_failed', 'Failed to load blocked users. Please try again.')
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [t]);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        void loadData(true);
    }, [loadData]);

    const handleUnblock = (target: BlockedUserProfile) => {
        if (!currentUserId) return;

        Alert.alert(
            t('profile.unblock_confirm_title', 'Unblock user'),
            t('profile.unblock_confirm_msg', {
                defaultValue: 'Unblock {{name}}? You will see this user’s content again.',
                name: target.displayName,
            }),
            [
                { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                {
                    text: t('profile.unblock_action', 'Unblock'),
                    style: 'destructive',
                    onPress: async () => {
                        const result = await unblockUser(currentUserId, target.id);
                        if (!result.success) {
                            Alert.alert(
                                t('common.error', 'Error'),
                                t('profile.unblock_failed', 'Failed to unblock user. Please try again.')
                            );
                            return;
                        }
                        setRows((prev) => prev.filter((item) => item.id !== target.id));
                        Alert.alert(
                            t('common.success', 'Success'),
                            t('profile.unblock_success', 'User has been unblocked.')
                        );
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: BlockedUserProfile }) => (
        <View style={styles.row}>
            <TouchableOpacity
                style={styles.rowProfileArea}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/profile/[id]' as any, params: { id: item.id } })}
            >
                {isRemoteImageUrl(item.avatarUrl) ? (
                    <CachedRemoteImage uri={item.avatarUrl} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <UserIcon size={20} color="#fff" />
                    </View>
                )}
                <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                        {item.major || t('profile.blocked_users_unknown_major', 'Student')}
                    </Text>
                    <Text style={styles.meta}>
                        {t('profile.blocked_since', {
                            defaultValue: 'Blocked on {{date}}',
                            date: item.blockedAt.toLocaleString(),
                        })}
                    </Text>
                </View>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item)}
            >
                <Text style={styles.unblockBtnText}>{t('profile.unblock_action', 'Unblock')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('profile.blocked_users_title', 'Blocked users')}</Text>
                <View style={styles.headerPlaceholder} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            ) : !currentUserId ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>
                        {t('profile.login_view_blocked_users', 'Please log in to view blocked users.')}
                    </Text>
                    <TouchableOpacity
                        style={styles.loginBtn}
                        onPress={() => router.replace('/(auth)/login')}
                    >
                        <Text style={styles.loginBtnText}>{t('profile.login_signup', 'Login / Sign up')}</Text>
                    </TouchableOpacity>
                </View>
            ) : rows.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>
                        {t('profile.blocked_users_empty', 'No blocked users yet.')}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#1E3A8A"
                        />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        backgroundColor: '#1E3A8A',
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerPlaceholder: {
        width: 36,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyText: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
    },
    loginBtn: {
        marginTop: 14,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#1E3A8A',
    },
    loginBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    listContent: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#EEF2FF',
    },
    rowProfileArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E5E7EB',
    },
    avatarPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1E3A8A',
    },
    info: {
        flex: 1,
        marginLeft: 12,
        minWidth: 0,
    },
    name: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    meta: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    unblockBtn: {
        marginLeft: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#FEE2E2',
    },
    unblockBtnText: {
        color: '#DC2626',
        fontSize: 12,
        fontWeight: '700',
    },
});

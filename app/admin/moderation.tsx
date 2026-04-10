import { useRouter } from 'expo-router';
import { ArrowLeft, Ban, CheckCircle2, Clock3, ShieldAlert, Trash2, XCircle } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser } from '../../services/auth';
import {
    applyModerationEnforcementAction,
    fetchModerationReports,
    fetchModerationSlaSummary,
    fetchUnreadModerationAlertCount,
    markModerationAlertsAsRead,
    Report,
    ReportStatus,
    updateModerationReport,
} from '../../services/moderation';
import { isAdmin } from '../../utils/userUtils';

type ReportFilter = 'pending' | 'all' | 'resolved';

export default function ModerationAdminScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [reviewerId, setReviewerId] = useState<string | null>(null);
    const [filter, setFilter] = useState<ReportFilter>('pending');
    const [reports, setReports] = useState<Report[]>([]);
    const [newAlertCount, setNewAlertCount] = useState(0);
    const [summary, setSummary] = useState({
        pending: 0,
        overdue: 0,
        resolvedIn24h: 0,
        totalResolved: 0,
    });

    const getStatusLabel = (status: ReportStatus) => {
        if (status === 'pending') return t('moderation_admin.status_pending', '待处理');
        if (status === 'under_review') return t('moderation_admin.status_under_review', '审核中');
        if (status === 'resolved') return t('moderation_admin.status_resolved', '已处理');
        return t('moderation_admin.status_dismissed', '已驳回');
    };

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const user = await getCurrentUser();
            const canReview = await isAdmin(user?.uid);
            setAuthorized(canReview);
            setReviewerId(user?.uid || null);

            if (!canReview) {
                setReports([]);
                setNewAlertCount(0);
                return;
            }

            const [reportRows, overview, unreadAlertCount] = await Promise.all([
                fetchModerationReports({
                    status: filter === 'all' ? 'all' : filter === 'resolved' ? 'resolved' : 'pending',
                    limit: 200,
                }),
                fetchModerationSlaSummary(),
                fetchUnreadModerationAlertCount(user?.uid || ''),
            ]);

            setReports(reportRows);
            setSummary(overview);
            setNewAlertCount(unreadAlertCount);

            if (user?.uid && unreadAlertCount > 0) {
                await markModerationAlertsAsRead(user.uid);
            }
        } catch (error) {
            console.error('Failed to load moderation reports:', error);
            Alert.alert(
                t('moderation_admin.load_failed_title', '加载失败'),
                t('moderation_admin.load_failed_msg', '审核数据加载失败，请稍后重试。'),
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [filter]);

    const orderedReports = useMemo(() => {
        return [...reports].sort((left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime(),
        );
    }, [reports]);

    const resolveReport = async (report: Report, nextStatus: 'resolved' | 'dismissed') => {
        if (!reviewerId) return;
        try {
            await updateModerationReport({
                reportId: report.id,
                reviewerId,
                status: nextStatus,
                resolution: nextStatus === 'resolved'
                    ? 'Removed or actioned within moderation workflow.'
                    : 'Insufficient evidence after review.',
            });
            await loadData(true);
        } catch (error) {
            console.error('Failed to update moderation report:', error);
            Alert.alert(
                t('moderation_admin.update_failed_title', '操作失败'),
                t('moderation_admin.update_failed_msg', '更新审核状态失败，请稍后重试。'),
            );
        }
    };

    const handleEnforcementAction = async (
        report: Report,
        action: 'remove_content' | 'ban_user' | 'remove_content_and_ban_user',
    ) => {
        try {
            await applyModerationEnforcementAction({
                reportId: report.id,
                action,
            });
            await loadData(true);
        } catch (error) {
            console.error('Failed to apply moderation enforcement action:', error);
            Alert.alert(
                t('moderation_admin.update_failed_title', '操作失败'),
                t('moderation_admin.enforcement_failed_msg', '执行审核处置失败，请稍后重试。'),
            );
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <ArrowLeft size={20} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.title}>{t('moderation_admin.title', '审核工作台')}</Text>
                <View style={styles.iconButton} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#1E3A8A" />
                </View>
            ) : !authorized ? (
                <View style={styles.center}>
                    <ShieldAlert size={22} color="#DC2626" />
                    <Text style={styles.emptyText}>{t('moderation_admin.no_permission', '你没有审核权限')}</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => {
                            setRefreshing(true);
                            void loadData(true);
                        }} />
                    }
                >
                    {newAlertCount > 0 && (
                        <View style={styles.newAlertBanner}>
                            <ShieldAlert size={14} color="#B91C1C" />
                            <Text style={styles.newAlertBannerText}>
                                {t('moderation_admin.new_alert_banner', {
                                    defaultValue: '收到 {{count}} 条新举报提醒',
                                    count: newAlertCount,
                                })}
                            </Text>
                        </View>
                    )}

                    <View style={styles.summaryRow}>
                        <View style={styles.summaryCard}>
                            <Clock3 size={16} color="#1E3A8A" />
                            <Text style={styles.summaryValue}>{summary.pending}</Text>
                            <Text style={styles.summaryLabel}>{t('moderation_admin.summary_pending', '待处理')}</Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <ShieldAlert size={16} color="#DC2626" />
                            <Text style={styles.summaryValue}>{summary.overdue}</Text>
                            <Text style={styles.summaryLabel}>{t('moderation_admin.summary_overdue', '超时')}</Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <CheckCircle2 size={16} color="#15803D" />
                            <Text style={styles.summaryValue}>{summary.resolvedIn24h}</Text>
                            <Text style={styles.summaryLabel}>{t('moderation_admin.summary_resolved_24h', '24h内完成')}</Text>
                        </View>
                    </View>

                    <View style={styles.filterRow}>
                        {[
                            { key: 'pending', label: t('moderation_admin.filter_pending', '待处理') },
                            { key: 'resolved', label: t('moderation_admin.filter_resolved', '已处理') },
                            { key: 'all', label: t('moderation_admin.filter_all', '全部') },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.key}
                                style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
                                onPress={() => setFilter(item.key as ReportFilter)}
                            >
                                <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {orderedReports.length === 0 ? (
                        <Text style={styles.emptyText}>{t('moderation_admin.empty', '暂无举报记录')}</Text>
                    ) : orderedReports.map((report) => {
                        const isPending = report.status === 'pending' || report.status === 'under_review';
                        const canRemoveContent = report.targetType !== 'user';
                        const canBanUser = report.targetType === 'user' || !!report.targetAuthorId;
                        return (
                            <View style={styles.card} key={report.id}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTarget}>{report.targetType}</Text>
                                    <Text style={styles.cardStatus}>{getStatusLabel(report.status)}</Text>
                                </View>
                                <Text style={styles.cardMeta}>
                                    {t('moderation_admin.card_reason', { defaultValue: '原因：{{reason}}', reason: report.reason })}
                                </Text>
                                <Text style={styles.cardMeta}>
                                    {t('moderation_admin.card_target_id', { defaultValue: '目标ID：{{id}}', id: report.targetId })}
                                </Text>
                                <Text style={styles.cardMeta}>
                                    {t('moderation_admin.card_created_at', {
                                        defaultValue: '提交时间：{{time}}',
                                        time: report.createdAt.toLocaleString(),
                                    })}
                                </Text>
                                {!!report.details && (
                                    <Text style={styles.cardMeta}>
                                        {t('moderation_admin.card_details', { defaultValue: '补充：{{details}}', details: report.details })}
                                    </Text>
                                )}
                                {isPending && (
                                    <>
                                        <View style={styles.actionRow}>
                                            {canRemoveContent && (
                                                <TouchableOpacity
                                                    style={[styles.actionButton, styles.removeButton]}
                                                    onPress={() => {
                                                        Alert.alert(
                                                            t('moderation_admin.confirm_remove_title', '移除内容'),
                                                            t('moderation_admin.confirm_remove_msg', '确认移除被举报内容并结案？'),
                                                            [
                                                                { text: t('common.cancel', '取消'), style: 'cancel' },
                                                                { text: t('common.ok', '确认'), onPress: () => { void handleEnforcementAction(report, 'remove_content'); } },
                                                            ],
                                                        );
                                                    }}
                                                >
                                                    <Trash2 size={14} color="#fff" />
                                                    <Text style={styles.actionText}>{t('moderation_admin.action_remove_content', '移除内容')}</Text>
                                                </TouchableOpacity>
                                            )}
                                            {canBanUser && (
                                                <TouchableOpacity
                                                    style={[styles.actionButton, styles.banButton]}
                                                    onPress={() => {
                                                        Alert.alert(
                                                            t('moderation_admin.confirm_ban_title', '封禁用户'),
                                                            t('moderation_admin.confirm_ban_msg', '确认封禁该用户并结案？'),
                                                            [
                                                                { text: t('common.cancel', '取消'), style: 'cancel' },
                                                                { text: t('common.ok', '确认'), onPress: () => { void handleEnforcementAction(report, canRemoveContent ? 'remove_content_and_ban_user' : 'ban_user'); } },
                                                            ],
                                                        );
                                                    }}
                                                >
                                                    <Ban size={14} color="#fff" />
                                                    <Text style={styles.actionText}>{t('moderation_admin.action_ban_user', '封禁用户')}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <View style={styles.actionRow}>
                                            <TouchableOpacity
                                                style={[styles.actionButton, styles.resolveButton]}
                                                onPress={() => {
                                                    Alert.alert(
                                                        t('moderation_admin.confirm_resolve_title', '确认处理'),
                                                        t('moderation_admin.confirm_resolve_msg', '确认标记为已处理？'),
                                                        [
                                                            { text: t('common.cancel', '取消'), style: 'cancel' },
                                                            { text: t('common.ok', '确认'), onPress: () => { void resolveReport(report, 'resolved'); } },
                                                        ],
                                                    );
                                                }}
                                            >
                                                <CheckCircle2 size={14} color="#fff" />
                                                <Text style={styles.actionText}>{t('moderation_admin.action_resolve', '标记已处理')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionButton, styles.dismissButton]}
                                                onPress={() => {
                                                    Alert.alert(
                                                        t('moderation_admin.confirm_dismiss_title', '确认驳回'),
                                                        t('moderation_admin.confirm_dismiss_msg', '确认驳回该举报？'),
                                                        [
                                                            { text: t('common.cancel', '取消'), style: 'cancel' },
                                                            { text: t('common.ok', '确认'), onPress: () => { void resolveReport(report, 'dismissed'); } },
                                                        ],
                                                    );
                                                }}
                                            >
                                                <XCircle size={14} color="#fff" />
                                                <Text style={styles.actionText}>{t('moderation_admin.action_dismiss', '驳回')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        height: 56,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    iconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        color: '#0F172A',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    content: {
        padding: 16,
        paddingBottom: 28,
    },
    newAlertBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 12,
    },
    newAlertBannerText: {
        fontSize: 12,
        color: '#B91C1C',
        fontWeight: '700',
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    summaryCard: {
        flex: 1,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingVertical: 12,
        alignItems: 'center',
        gap: 2,
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    summaryLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    filterRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#E2E8F0',
    },
    filterChipActive: {
        backgroundColor: '#1E3A8A',
    },
    filterText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#334155',
    },
    filterTextActive: {
        color: '#fff',
    },
    emptyText: {
        textAlign: 'center',
        color: '#64748B',
        fontSize: 14,
        marginTop: 24,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
        marginBottom: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    cardTarget: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E3A8A',
    },
    cardStatus: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
    },
    cardMeta: {
        fontSize: 12,
        color: '#334155',
        marginBottom: 4,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    actionButton: {
        flex: 1,
        borderRadius: 10,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    resolveButton: {
        backgroundColor: '#15803D',
    },
    removeButton: {
        backgroundColor: '#B45309',
    },
    banButton: {
        backgroundColor: '#7C2D12',
    },
    dismissButton: {
        backgroundColor: '#DC2626',
    },
    actionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
});

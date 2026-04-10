import storage from '../lib/storage';
import { supabase } from './supabase';

export const COMMUNITY_EULA_VERSION = '2026-04-10';
const EULA_VERSION_STORAGE_KEY = 'eula_accepted_version';
const LEGACY_EULA_STORAGE_KEY = 'eula_accepted';

export type ReportReason =
    | 'spam'
    | 'harassment'
    | 'hate_speech'
    | 'sexual_content'
    | 'violence'
    | 'scam'
    | 'other';

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export type ModerationTargetType =
    | 'post'
    | 'comment'
    | 'forum_post'
    | 'forum_comment'
    | 'teacher_review'
    | 'course_review'
    | 'course_message'
    | 'direct_message'
    | 'exchange_post'
    | 'exchange_comment'
    | 'teaming_post'
    | 'teaming_comment'
    | 'user';

export interface Report {
    id: string;
    reporterId: string;
    targetId: string;
    targetType: ModerationTargetType;
    targetAuthorId?: string;
    reason: ReportReason;
    details?: string;
    status: ReportStatus;
    resolution?: string;
    reviewedBy?: string;
    reviewedAt?: Date;
    createdAt: Date;
    firstResponseDueAt?: Date;
}

export interface UserBlock {
    id: string;
    blockerId: string;
    blockedId: string;
    createdAt: Date;
}

export interface BlockedUserProfile {
    id: string;
    displayName: string;
    avatarUrl: string;
    major: string;
    blockedAt: Date;
}

export type ModerationEnforcementAction =
    | 'remove_content'
    | 'ban_user'
    | 'remove_content_and_ban_user';

export const MODERATION_ALERT_NOTIFICATION_TITLE = 'notifications.title_moderation_alert';

const isTableOrColumnMissing = (error: any) =>
    error?.code === 'PGRST205'
    || error?.code === '42P01'
    || error?.code === '42703'
    || String(error?.message || '').toLowerCase().includes('not found')
    || String(error?.message || '').toLowerCase().includes('does not exist');

const mapBlockReasonToReportReason = (reason?: string): ReportReason => {
    const normalized = String(reason || '').toLowerCase();
    if (normalized.includes('harass') || normalized.includes('abusive')) return 'harassment';
    if (normalized.includes('hate')) return 'hate_speech';
    if (normalized.includes('sexual')) return 'sexual_content';
    if (normalized.includes('violence')) return 'violence';
    if (normalized.includes('scam') || normalized.includes('spam')) return 'scam';
    return 'other';
};

const mapReport = (row: any): Report => ({
    id: row.id,
    reporterId: row.reporter_id,
    targetId: row.target_id,
    targetType: row.target_type as ModerationTargetType,
    targetAuthorId: row.target_author_id || undefined,
    reason: row.reason as ReportReason,
    details: row.details || undefined,
    status: row.status as ReportStatus,
    resolution: row.resolution || undefined,
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
    createdAt: new Date(row.created_at),
    firstResponseDueAt: row.first_response_due_at ? new Date(row.first_response_due_at) : undefined,
});

const insertModerationAction = async (payload: {
    actionType: string;
    actorId?: string;
    reportId?: string;
    targetUserId?: string;
    metadata?: Record<string, any>;
}) => {
    const { error } = await supabase
        .from('moderation_actions')
        .insert({
            action_type: payload.actionType,
            actor_id: payload.actorId || null,
            report_id: payload.reportId || null,
            target_user_id: payload.targetUserId || null,
            metadata: payload.metadata || {},
        });

    if (error && !isTableOrColumnMissing(error)) {
        console.warn('Failed to insert moderation action:', error);
    }
};

export const getLocalEulaAccepted = async (): Promise<boolean> => {
    try {
        const [acceptedVersion, legacyAccepted] = await Promise.all([
            storage.getItem(EULA_VERSION_STORAGE_KEY),
            storage.getItem(LEGACY_EULA_STORAGE_KEY),
        ]);
        return acceptedVersion === COMMUNITY_EULA_VERSION || legacyAccepted === 'true';
    } catch {
        return false;
    }
};

export const hasAcceptedCommunityEula = async (userId?: string | null): Promise<boolean> => {
    const localAccepted = await getLocalEulaAccepted();

    if (!userId) {
        return localAccepted;
    }

    const { data, error } = await supabase
        .from('user_eula_consents')
        .select('eula_version')
        .eq('user_id', userId)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return localAccepted;
        }
        console.warn('Error loading user EULA consent, falling back to local state:', error);
        return localAccepted;
    }

    if (data?.eula_version === COMMUNITY_EULA_VERSION) {
        return true;
    }

    if (localAccepted) {
        // Backfill server-side consent after login if user accepted locally before.
        void acceptCommunityEula(userId);
        return true;
    }

    return false;
};

export const acceptCommunityEula = async (userId?: string | null): Promise<boolean> => {
    try {
        await Promise.all([
            storage.setItem(EULA_VERSION_STORAGE_KEY, COMMUNITY_EULA_VERSION),
            storage.setItem(LEGACY_EULA_STORAGE_KEY, 'true'),
        ]);
    } catch (error) {
        console.warn('Failed to persist local EULA acceptance:', error);
    }

    if (!userId) {
        return true;
    }

    const { error } = await supabase
        .from('user_eula_consents')
        .upsert({
            user_id: userId,
            eula_version: COMMUNITY_EULA_VERSION,
            accepted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,eula_version' });

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return true;
        }
        console.error('Error saving EULA acceptance:', error);
        return false;
    }

    return true;
};

export const reportContent = async (params: {
    reporterId: string;
    targetId: string;
    targetType: ModerationTargetType;
    targetAuthorId?: string;
    reason: ReportReason;
    details?: string;
}) => {
    const payload = {
        reporter_id: params.reporterId,
        target_id: params.targetId,
        target_type: params.targetType,
        target_author_id: params.targetAuthorId || null,
        reason: params.reason,
        details: params.details || '',
        status: 'pending' as ReportStatus,
    };

    let data: any = null;
    let error: any = null;

    ({ data, error } = await supabase
        .from('reports')
        .insert(payload)
        .select()
        .single());

    if (error && isTableOrColumnMissing(error)) {
        ({ data, error } = await supabase
            .from('reports')
            .insert({
                reporter_id: params.reporterId,
                target_id: params.targetId,
                target_type: params.targetType,
                reason: params.reason,
                details: params.details || '',
                status: 'pending',
            })
            .select()
            .single());
    }

    if (error) {
        if (isTableOrColumnMissing(error)) {
            console.warn('Moderation table "reports" not found. Please apply latest migrations.');
        } else {
            console.error('Error reporting content:', error);
        }
        throw error;
    }

    await insertModerationAction({
        actionType: 'report_created',
        actorId: params.reporterId,
        reportId: data.id,
        targetUserId: params.targetAuthorId,
        metadata: {
            target_type: params.targetType,
            reason: params.reason,
        },
    });

    return { success: true, id: data.id };
};

export const blockUser = async (
    blockerId: string,
    blockedId: string,
    context?: { source?: string; reason?: string },
) => {
    if (!blockerId || !blockedId || blockerId === blockedId) {
        return { success: false };
    }

    const { data: existingBlock } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();

    const alreadyBlocked = !!existingBlock?.id;

    const { error } = await supabase
        .from('user_blocks')
        .upsert({
            blocker_id: blockerId,
            blocked_id: blockedId,
            created_at: new Date().toISOString(),
        }, { onConflict: 'blocker_id,blocked_id' });

    if (error) {
        console.error('Error blocking user:', error);
        throw error;
    }

    if (!alreadyBlocked) {
        await insertModerationAction({
            actionType: 'user_blocked',
            actorId: blockerId,
            targetUserId: blockedId,
            metadata: {
                source: context?.source || 'unknown',
                reason: context?.reason || 'user_initiated_block',
            },
        });

        try {
            await reportContent({
                reporterId: blockerId,
                targetId: blockedId,
                targetType: 'user',
                targetAuthorId: blockedId,
                reason: mapBlockReasonToReportReason(context?.reason),
                details: `Auto-created from user block. Source=${context?.source || 'unknown'}; reason=${context?.reason || 'user_initiated_block'}`,
            });
        } catch (reportError) {
            console.warn('Block succeeded but failed to create moderation report for blocked user:', reportError);
        }
    }

    return { success: true };
};

export const getBlockedUserIds = async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', userId);

    if (error) {
        if (isTableOrColumnMissing(error)) {
            console.warn('Moderation tables not found in Supabase. Please apply latest migrations.');
            return [];
        }
        console.error('Error fetching blocked users:', error);
        return [];
    }

    return (data || []).map((row: any) => row.blocked_id);
};

export const fetchBlockedUsers = async (userId: string): Promise<BlockedUserProfile[]> => {
    const { data: blockRows, error: blockError } = await supabase
        .from('user_blocks')
        .select('blocked_id, created_at')
        .eq('blocker_id', userId)
        .order('created_at', { ascending: false });

    if (blockError) {
        if (isTableOrColumnMissing(blockError)) {
            console.warn('Moderation tables not found in Supabase. Please apply latest migrations.');
            return [];
        }
        console.error('Error fetching blocked users:', blockError);
        return [];
    }

    const blockedUserIds = (blockRows || []).map((row: any) => row.blocked_id);
    if (blockedUserIds.length === 0) {
        return [];
    }

    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, display_name, avatar_url, major')
        .in('id', blockedUserIds);

    if (userError) {
        console.error('Error fetching blocked user profiles:', userError);
        const fallbackName = 'User';
        return (blockRows || []).map((row: any) => ({
            id: row.blocked_id,
            displayName: fallbackName,
            avatarUrl: '',
            major: '',
            blockedAt: new Date(row.created_at),
        }));
    }

    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

    return (blockRows || []).map((row: any) => {
        const profile = userMap.get(row.blocked_id);
        return {
            id: row.blocked_id,
            displayName: profile?.display_name || 'User',
            avatarUrl: profile?.avatar_url || '',
            major: profile?.major || '',
            blockedAt: new Date(row.created_at),
        };
    });
};

export const getUsersWhoBlockedMe = async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase
        .from('user_blocks')
        .select('blocker_id')
        .eq('blocked_id', userId);

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return [];
        }
        console.error('Error fetching users who blocked me:', error);
        return [];
    }

    return (data || []).map((row: any) => row.blocker_id);
};

export const hasBlockingRelation = async (userA: string, userB: string): Promise<boolean> => {
    if (!userA || !userB) return false;

    const { data, error } = await supabase
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`)
        .limit(1);

    if (error) {
        if (isTableOrColumnMissing(error)) return false;
        console.error('Error checking blocking relation:', error);
        return false;
    }

    return (data || []).length > 0;
};

export const unblockUser = async (blockerId: string, blockedId: string) => {
    const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);

    if (error) {
        console.error('Error unblocking user:', error);
        return { success: false };
    }

    await insertModerationAction({
        actionType: 'user_unblocked',
        actorId: blockerId,
        targetUserId: blockedId,
    });

    return { success: true };
};

export const fetchUnreadModerationAlertCount = async (userId: string): Promise<number> => {
    if (!userId) return 0;

    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'system')
        .eq('title', MODERATION_ALERT_NOTIFICATION_TITLE)
        .eq('is_read', false);

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return 0;
        }
        console.error('Error fetching moderation alert count:', error);
        return 0;
    }

    return count || 0;
};

export const markModerationAlertsAsRead = async (userId: string): Promise<boolean> => {
    if (!userId) return false;

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('type', 'system')
        .eq('title', MODERATION_ALERT_NOTIFICATION_TITLE)
        .eq('is_read', false);

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return false;
        }
        console.error('Error marking moderation alerts as read:', error);
        return false;
    }

    return true;
};

export const fetchModerationReports = async (params?: {
    status?: ReportStatus | 'all';
    limit?: number;
}): Promise<Report[]> => {
    const status = params?.status || 'all';
    const limit = params?.limit || 100;

    let query = supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status !== 'all') {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
        if (isTableOrColumnMissing(error)) {
            return [];
        }
        throw error;
    }

    return (data || []).map(mapReport);
};

export const updateModerationReport = async (params: {
    reportId: string;
    reviewerId: string;
    status: Exclude<ReportStatus, 'pending'>;
    resolution: string;
}) => {
    const { data, error } = await supabase
        .from('reports')
        .update({
            status: params.status,
            resolution: params.resolution,
            reviewed_by: params.reviewerId,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', params.reportId)
        .select()
        .single();

    if (error) {
        console.error('Error updating moderation report:', error);
        throw error;
    }

    await insertModerationAction({
        actionType: `report_${params.status}`,
        actorId: params.reviewerId,
        reportId: params.reportId,
        targetUserId: data?.target_author_id || undefined,
        metadata: {
            resolution: params.resolution,
        },
    });

    return mapReport(data);
};

export const applyModerationEnforcementAction = async (params: {
    reportId: string;
    action: ModerationEnforcementAction;
    note?: string;
}) => {
    const { data, error } = await supabase.rpc('moderation_apply_action', {
        report_id: params.reportId,
        action: params.action,
        note: params.note || null,
    });

    if (error) {
        console.error('Error applying moderation enforcement action:', error);
        throw error;
    }

    return data;
};

export const fetchModerationSlaSummary = async () => {
    const { data, error } = await supabase
        .from('reports')
        .select('status, created_at, reviewed_at, first_response_due_at');

    if (error) {
        if (isTableOrColumnMissing(error)) {
            return { pending: 0, overdue: 0, resolvedIn24h: 0, totalResolved: 0 };
        }
        throw error;
    }

    const now = Date.now();
    const rows = data || [];
    let pending = 0;
    let overdue = 0;
    let totalResolved = 0;
    let resolvedIn24h = 0;

    rows.forEach((row: any) => {
        if (row.status === 'pending' || row.status === 'under_review') {
            pending += 1;
            const due = row.first_response_due_at
                ? new Date(row.first_response_due_at).getTime()
                : new Date(row.created_at).getTime() + 24 * 60 * 60 * 1000;
            if (due < now) {
                overdue += 1;
            }
        }

        if (row.status === 'resolved' || row.status === 'dismissed') {
            totalResolved += 1;
            const createdAt = new Date(row.created_at).getTime();
            const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at).getTime() : null;
            if (reviewedAt && reviewedAt - createdAt <= 24 * 60 * 60 * 1000) {
                resolvedIn24h += 1;
            }
        }
    });

    return {
        pending,
        overdue,
        resolvedIn24h,
        totalResolved,
    };
};

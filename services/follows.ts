import { supabase } from './supabase';

const USER_FOLLOWS_TABLE = 'user_follows';

const isFollowTableMissing = (error: any): boolean => {
    const msg = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || msg.includes(USER_FOLLOWS_TABLE);
};

export interface FollowCounts {
    followersCount: number;
    followingCount: number;
}

export const isFollowingUser = async (
    followerId?: string,
    followingId?: string,
): Promise<boolean> => {
    if (!followerId || !followingId || followerId === followingId) {
        return false;
    }

    const { data, error } = await supabase
        .from(USER_FOLLOWS_TABLE)
        .select('following_id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

    if (error) {
        if (isFollowTableMissing(error)) {
            return false;
        }
        console.error('Error checking follow status:', error);
        throw error;
    }

    return !!data;
};

export const followUser = async (followerId: string, followingId: string): Promise<void> => {
    if (!followerId || !followingId || followerId === followingId) {
        return;
    }

    const { error } = await supabase
        .from(USER_FOLLOWS_TABLE)
        .insert([{ follower_id: followerId, following_id: followingId }]);

    // 23505 = unique_violation (already followed)
    if (error && error.code !== '23505') {
        console.error('Error following user:', error);
        throw error;
    }
};

export const unfollowUser = async (followerId: string, followingId: string): Promise<void> => {
    if (!followerId || !followingId || followerId === followingId) {
        return;
    }

    const { error } = await supabase
        .from(USER_FOLLOWS_TABLE)
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

    if (error) {
        console.error('Error unfollowing user:', error);
        throw error;
    }
};

export const getFollowCounts = async (userId: string): Promise<FollowCounts> => {
    const [followersRes, followingRes] = await Promise.all([
        supabase
            .from(USER_FOLLOWS_TABLE)
            .select('*', { count: 'exact', head: true })
            .eq('following_id', userId),
        supabase
            .from(USER_FOLLOWS_TABLE)
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', userId),
    ]);

    if (followersRes.error) {
        if (isFollowTableMissing(followersRes.error)) {
            return { followersCount: 0, followingCount: 0 };
        }
        console.error('Error fetching followers count:', followersRes.error);
        throw followersRes.error;
    }
    if (followingRes.error) {
        if (isFollowTableMissing(followingRes.error)) {
            return { followersCount: 0, followingCount: 0 };
        }
        console.error('Error fetching following count:', followingRes.error);
        throw followingRes.error;
    }

    return {
        followersCount: followersRes.count || 0,
        followingCount: followingRes.count || 0,
    };
};

export const getFollowingUserIds = async (followerId?: string): Promise<string[]> => {
    if (!followerId) return [];

    const { data, error } = await supabase
        .from(USER_FOLLOWS_TABLE)
        .select('following_id')
        .eq('follower_id', followerId);

    if (error) {
        if (isFollowTableMissing(error)) {
            return [];
        }
        console.error('Error fetching following list:', error);
        throw error;
    }

    return (data || []).map((item: any) => item.following_id).filter(Boolean);
};

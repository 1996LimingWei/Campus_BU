import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { CourseTeaming, TeamingComment } from '../types';
import { supabase } from './supabase';

const TEAMING_TABLE = 'course_teaming';
const TEAMING_COMMENTS_TABLE = 'teaming_comments';
const TEAMING_STORAGE_BUCKET = 'teaming-avatars';

/**
 * Check if a string is a local file path (not a URL)
 */
const isLocalFilePath = (uri: string): boolean => {
    if (!uri) return false;
    return uri.startsWith('file://') || 
           uri.startsWith('/var/') || 
           uri.startsWith('/data/') ||
           uri.includes('ImagePicker') ||
           uri.includes('ExponentExperienceData');
};

/**
 * Upload avatar image to Supabase Storage and return public URL
 */
const uploadTeamingAvatar = async (uri: string, prefix: string): Promise<string> => {
    try {
        const fileName = `${prefix}/${Date.now()}.jpg`;

        // Read the file as base64 using expo-file-system (reliable in React Native)
        const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
        });

        // Decode base64 to ArrayBuffer for Supabase
        const arrayBuffer = decode(base64Data);

        const { data, error } = await supabase.storage
            .from(TEAMING_STORAGE_BUCKET)
            .upload(fileName, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
            });

        if (error) {
            console.error('Avatar upload error:', error);
            throw error;
        }

        const { data: { publicUrl } } = supabase.storage
            .from(TEAMING_STORAGE_BUCKET)
            .getPublicUrl(fileName);

        return publicUrl;
    } catch (e) {
        console.error('Failed to upload avatar:', e);
        return '👤'; // Return default emoji on failure
    }
};

/**
 * Fetch teaming requests for a specific course.
 */
export const fetchTeamingRequests = async (courseId: string): Promise<CourseTeaming[]> => {
    try {
        const { data, error } = await supabase
            .from(TEAMING_TABLE)
            .select('*, author:users!user_id(*)')
            .eq('course_id', courseId)
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching teaming requests:', error);
            return [];
        }

        return (data || []).map(mapSupabaseToTeaming);
    } catch (e) {
        console.error('Exception fetching teaming requests:', e);
        return [];
    }
};

/**
 * Post a new teaming request.
 */
export const postTeamingRequest = async (request: Partial<CourseTeaming>): Promise<{ success: boolean; data?: CourseTeaming; error?: string }> => {
    try {
        // Upload avatar if it's a local file path
        let avatarUrl = request.userAvatar || '👤';
        if (isLocalFilePath(avatarUrl)) {
            avatarUrl = await uploadTeamingAvatar(avatarUrl, `teaming-${request.userId}`);
        }

        const teamingData = {
            course_id: request.courseId,
            user_id: request.userId,
            user_name: request.userName,
            user_avatar: avatarUrl,
            user_major: request.userMajor,
            section: request.section,
            self_intro: request.selfIntro,
            target_teammate: request.targetTeammate,
            contacts: request.contacts,
            status: 'open',
            likes: 0,
            comment_count: 0,
        };

        console.log('Inserting teaming data:', JSON.stringify(teamingData, null, 2));

        const { data, error } = await supabase
            .from(TEAMING_TABLE)
            .insert(teamingData)
            .select()
            .single();

        if (error) {
            console.error('Supabase insert error:', error);
            return {
                success: false,
                error: error.message,
            };
        }

        return {
            success: true,
            data: mapSupabaseToTeaming(data),
        };
    } catch (e: any) {
        console.error('Error posting teaming request:', e);
        return {
            success: false,
            error: e?.message || 'Unknown error',
        };
    }
};

/**
 * Toggle like for a teaming request.
 */
export const toggleTeamingLike = async (teamingId: string, userId: string): Promise<{ success: boolean }> => {
    try {
        // Get current likes
        const { data: teaming, error: fetchError } = await supabase
            .from(TEAMING_TABLE)
            .select('likes')
            .eq('id', teamingId)
            .single();

        if (fetchError || !teaming) return { success: false };

        // Update likes
        const { error: updateError } = await supabase
            .from(TEAMING_TABLE)
            .update({ likes: (teaming.likes || 0) + 1 })
            .eq('id', teamingId);

        if (updateError) return { success: false };
        return { success: true };
    } catch (e) {
        console.error('Error toggling like:', e);
        return { success: false };
    }
};

/**
 * Fetch comments for a teaming request.
 */
export const fetchTeamingComments = async (teamingId: string): Promise<TeamingComment[]> => {
    try {
        const { data, error } = await supabase
            .from(TEAMING_COMMENTS_TABLE)
            .select('*, author:users!author_id(*)')
            .eq('teaming_id', teamingId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching teaming comments:', error);
            return [];
        }

        return (data || []).map(mapSupabaseToTeamingComment);
    } catch (e) {
        console.error('Exception fetching teaming comments:', e);
        return [];
    }
};

/**
 * Post a comment to a teaming request.
 */
export const postTeamingComment = async (teamingId: string, author: any, content: string): Promise<{ success: boolean; error?: string }> => {
    try {
        // Support both naming conventions (uid/id, displayName/name, avatarUrl/avatar)
        const authorId = author.uid || author.id;
        const authorName = author.displayName || author.display_name || author.name || 'Anonymous';
        let authorAvatar = author.avatarUrl || author.avatar_url || author.avatar || '👤';

        // Upload avatar if it's a local file path
        if (isLocalFilePath(authorAvatar)) {
            authorAvatar = await uploadTeamingAvatar(authorAvatar, `comment-${authorId}`);
        }

        console.log('Posting teaming comment:', { teamingId, authorId, authorName, content });

        const { error: insertError } = await supabase
            .from(TEAMING_COMMENTS_TABLE)
            .insert({
                teaming_id: teamingId,
                author_id: authorId,
                author_name: authorName,
                author_avatar: authorAvatar,
                content,
            });

        if (insertError) {
            console.error('Error inserting teaming comment:', insertError);
            return { success: false, error: insertError.message };
        }

        // Increment comment count
        await incrementTeamingCommentCount(teamingId);

        return { success: true };
    } catch (e: any) {
        console.error('Error posting teaming comment:', e);
        return { success: false, error: e?.message || 'Unknown error' };
    }
};

// Helper functions

// Helper to check if avatar is a valid URL (not local file path)
const isValidAvatarUrl = (url: string): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
};

const isEmojiAvatar = (str: string): boolean => {
    return !!str && str.length <= 2 && !str.startsWith('http');
};

const mapSupabaseToTeaming = (data: any): CourseTeaming => {
    const author = data.author;
    
    // Priority: 1. Valid URL from user_avatar, 2. Valid URL from author.avatar_url, 3. Emoji fallback
    let avatarToUse = '👤';
    
    if (isValidAvatarUrl(data.user_avatar)) {
        avatarToUse = data.user_avatar;
    } else if (author?.avatar_url && isValidAvatarUrl(author.avatar_url)) {
        avatarToUse = author.avatar_url;
    } else if (isEmojiAvatar(data.user_avatar)) {
        avatarToUse = data.user_avatar;
    }
    
    return {
        id: data.id,
        courseId: data.course_id,
        userId: data.user_id,
        userName: author ? (author.display_name || author.displayName) : data.user_name,
        userEmail: author?.email,
        userAvatar: avatarToUse,
        userMajor: author ? author.major : data.user_major,
        section: data.section,
        selfIntro: data.self_intro,
        targetTeammate: data.target_teammate,
        contacts: data.contacts,
        createdAt: new Date(data.created_at),
        status: data.status,
        likes: data.likes || 0,
        commentCount: data.comment_count || 0,
    };
};

const mapSupabaseToTeamingComment = (data: any): TeamingComment => {
    const author = data.author;
    
    // Priority: 1. Valid URL from author_avatar, 2. Valid URL from author.avatar_url, 3. Emoji fallback
    let avatarToUse = '👤';
    
    if (isValidAvatarUrl(data.author_avatar)) {
        avatarToUse = data.author_avatar;
    } else if (author?.avatar_url && isValidAvatarUrl(author.avatar_url)) {
        avatarToUse = author.avatar_url;
    } else if (isEmojiAvatar(data.author_avatar)) {
        avatarToUse = data.author_avatar;
    }
    
    return {
        id: data.id,
        teamingId: data.teaming_id,
        authorId: data.author_id,
        authorName: author ? (author.display_name || author.displayName) : data.author_name,
        authorEmail: author?.email,
        authorAvatar: avatarToUse,
        content: data.content,
        createdAt: new Date(data.created_at),
    };
};

const incrementTeamingCommentCount = async (teamingId: string) => {
    try {
        await supabase.rpc('increment_teaming_comment_count', { row_id: teamingId });
    } catch (e) {
        console.error('Error incrementing comment count:', e);
    }
};

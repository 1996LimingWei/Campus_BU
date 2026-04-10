import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { CourseTeaming, TeamingComment } from '../types';
import { IMMUTABLE_STORAGE_CACHE_CONTROL } from '../utils/remoteImage';
import { ensureMultipleContentsSafety } from './contentFilter';
import { getLocalCourses } from './courses';
import { getBlockedUserIds } from './moderation';
import { supabase } from './supabase';

const TEAMING_TABLE = 'course_teaming';
const TEAMING_COMMENTS_TABLE = 'teaming_comments';
const TEAMING_STORAGE_BUCKET = 'teaming-avatars';

const normalizeCourseCode = (value: string): string => value.toUpperCase().replace(/\s+/g, '');

const resolveCourseIdForTeamingQueries = async (courseId?: string): Promise<string> => {
    if (!courseId) return '';

    // Direct ID match
    const { data: existingById } = await supabase
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .maybeSingle();
    if (existingById?.id) return existingById.id;

    // Fallback: input might be a course code
    const normalized = normalizeCourseCode(courseId);
    const { data: existingByCode } = await supabase
        .from('courses')
        .select('id')
        .eq('code', normalized)
        .maybeSingle();
    if (existingByCode?.id) return existingByCode.id;

    // Local course IDs can often be mapped by code to an existing DB row
    if (courseId.startsWith('local_')) {
        const localCourses = await getLocalCourses();
        const matchedLocal = localCourses.find(c => c.id === courseId);
        if (matchedLocal?.code) {
            const normalizedCode = normalizeCourseCode(matchedLocal.code);
            const { data: mappedByCode } = await supabase
                .from('courses')
                .select('id')
                .eq('code', normalizedCode)
                .maybeSingle();
            if (mappedByCode?.id) return mappedByCode.id;
        }
    }

    return courseId;
};

const ensureCourseExistsForTeaming = async (courseId?: string): Promise<{ resolvedCourseId?: string; error?: string }> => {
    if (!courseId) {
        return { error: 'Missing course ID.' };
    }

    const resolvedId = await resolveCourseIdForTeamingQueries(courseId);

    const { data: existing } = await supabase
        .from('courses')
        .select('id')
        .eq('id', resolvedId)
        .maybeSingle();
    if (existing?.id) {
        return { resolvedCourseId: existing.id };
    }

    // Placeholder courses do not exist in the database and cannot be posted to FK-backed tables.
    if (courseId === '1') {
        return { error: 'This course cannot accept teaming posts yet. Please choose a real course.' };
    }

    // Auto-create for local courses so FK remains valid.
    if (courseId.startsWith('local_')) {
        const localCourses = await getLocalCourses();
        const local = localCourses.find(c => c.id === courseId);
        if (!local) {
            return { error: `Course ${courseId} is not available.` };
        }

        const normalizedCode = normalizeCourseCode(local.code || courseId.replace(/^local_/, ''));
        const { data: existingByCode } = await supabase
            .from('courses')
            .select('id')
            .eq('code', normalizedCode)
            .maybeSingle();
        if (existingByCode?.id) {
            return { resolvedCourseId: existingByCode.id };
        }

        const { error: createError } = await supabase
            .from('courses')
            .insert({
                id: courseId,
                code: normalizedCode,
                name: local.name || normalizedCode,
                instructor: local.instructor || 'TBD',
                department: local.department || 'General',
                credits: local.credits || 3,
            });

        if (createError) {
            return { error: createError.message || 'Failed to create local course in database.' };
        }

        return { resolvedCourseId: courseId };
    }

    return { error: `Course ${courseId} was not found in database.` };
};

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
                cacheControl: IMMUTABLE_STORAGE_CACHE_CONTROL,
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
export const fetchTeamingRequests = async (courseId: string, currentUserId?: string): Promise<CourseTeaming[]> => {
    try {
        const resolvedCourseId = await resolveCourseIdForTeamingQueries(courseId);

        const { data, error } = await supabase
            .from(TEAMING_TABLE)
            .select('*, author:users!user_id(*)')
            .eq('course_id', resolvedCourseId)
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching teaming requests:', error);
            return [];
        }

        let rows = (data || []).map(mapSupabaseToTeaming);

        if (currentUserId) {
            const blockedIds = await getBlockedUserIds(currentUserId);
            if (blockedIds.length > 0) {
                const blockedSet = new Set(blockedIds);
                rows = rows.filter((row) => !blockedSet.has(row.userId));
            }
        }

        return rows;
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
        ensureMultipleContentsSafety([
            request.section || '',
            request.selfIntro || '',
            request.targetTeammate || '',
        ]);

        const { resolvedCourseId, error: courseError } = await ensureCourseExistsForTeaming(request.courseId);
        if (courseError || !resolvedCourseId) {
            return {
                success: false,
                error: courseError || 'Invalid course.',
            };
        }

        // Upload avatar if it's a local file path
        let avatarUrl = request.userAvatar || '👤';
        if (isLocalFilePath(avatarUrl)) {
            avatarUrl = await uploadTeamingAvatar(avatarUrl, `teaming-${request.userId}`);
        }

        const teamingData = {
            course_id: resolvedCourseId,
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

        // Trigger notification
        const { data: teamingData } = await supabase.from(TEAMING_TABLE).select('user_id, course_id').eq('id', teamingId).single();
        if (teamingData && teamingData.user_id !== userId) {
            const { getCourseById } = await import('./courses');
            const course = await getCourseById(teamingData.course_id);
            const { createNotification } = await import('./notifications');
            await createNotification({
                user_id: teamingData.user_id,
                type: 'like',
                title: 'notifications.title_like',
                content: JSON.stringify({
                    key: 'notifications.teaming_like',
                    params: { course: course?.code || 'course' }
                }),
                related_id: teamingId,
            });
        }

        return { success: true };
    } catch (e) {
        console.error('Error toggling like:', e);
        return { success: false };
    }
};

/**
 * Fetch comments for a teaming request.
 */
export const fetchTeamingComments = async (teamingId: string, currentUserId?: string): Promise<TeamingComment[]> => {
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

        let rows = (data || []).map(mapSupabaseToTeamingComment);

        if (currentUserId) {
            const blockedIds = await getBlockedUserIds(currentUserId);
            if (blockedIds.length > 0) {
                const blockedSet = new Set(blockedIds);
                rows = rows.filter((row) => !blockedSet.has(row.authorId));
            }
        }

        return rows;
    } catch (e) {
        console.error('Exception fetching teaming comments:', e);
        return [];
    }
};

/**
 * Post a comment to a teaming request.
 */
export const postTeamingComment = async (
    teamingId: string,
    author: any,
    content: string,
    parentCommentId?: string,
    replyToName?: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        ensureMultipleContentsSafety([content, replyToName || '']);

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
                parent_comment_id: parentCommentId,
                reply_to_name: replyToName,
            });

        if (insertError) {
            console.error('Error inserting teaming comment:', insertError);
            return { success: false, error: insertError.message };
        }

        // Trigger notification
        const { data: teaming } = await supabase.from(TEAMING_TABLE).select('user_id, course_id').eq('id', teamingId).single();
        if (teaming && teaming.user_id !== authorId) {
            const { getCourseById } = await import('./courses');
            const course = await getCourseById(teaming.course_id);
            const { createNotification } = await import('./notifications');
            await createNotification({
                user_id: teaming.user_id,
                type: 'comment',
                title: 'notifications.title_comment',
                content: JSON.stringify({
                    key: 'notifications.teaming_comment',
                    params: { name: authorName, course: course?.code || 'course' }
                }),
                related_id: teamingId,
            });
        }

        // Increment comment count
        await incrementTeamingCommentCount(teamingId);

        return { success: true };
    } catch (e: any) {
        console.error('Error posting teaming comment:', e);
        return { success: false, error: e?.message || 'Unknown error' };
    }
};

/**
 * Delete a teaming request posted by current user.
 */
export const deleteTeamingRequest = async (teamingId: string, userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        // Read target row first so we can return a precise error instead of a generic "0 rows" message.
        const { data: existingRow, error: existingError } = await supabase
            .from(TEAMING_TABLE)
            .select('id, user_id, status')
            .eq('id', teamingId)
            .maybeSingle();

        if (existingError) {
            return { success: false, error: existingError.message };
        }

        // If the row is already gone, treat delete as idempotent success.
        if (!existingRow) {
            return { success: true };
        }

        if (existingRow.user_id !== userId) {
            return { success: false, error: 'You can only delete your own teaming post.' };
        }

        // Clean up comments first to avoid FK constraints in environments without cascade.
        const { error: commentDeleteError } = await supabase
            .from(TEAMING_COMMENTS_TABLE)
            .delete()
            .eq('teaming_id', teamingId);

        if (commentDeleteError) {
            console.warn('Comment cleanup before teaming delete failed:', commentDeleteError);
        }

        const { error: deleteError } = await supabase
            .from(TEAMING_TABLE)
            .delete()
            .eq('id', teamingId);

        if (deleteError) {
            return { success: false, error: deleteError.message };
        }

        // Verify delete result explicitly (helps when RLS silently blocks mutation).
        const { data: rowAfterDelete, error: rowAfterDeleteError } = await supabase
            .from(TEAMING_TABLE)
            .select('id, status')
            .eq('id', teamingId)
            .maybeSingle();

        if (rowAfterDeleteError) {
            return { success: false, error: rowAfterDeleteError.message };
        }

        if (!rowAfterDelete) {
            return { success: true };
        }

        // Fallback: if hard delete did not affect any rows, try soft-close so it won't be fetched by status='open'.
        const { error: closeError } = await supabase
            .from(TEAMING_TABLE)
            .update({ status: 'closed' })
            .eq('id', teamingId)
            .eq('user_id', userId);

        if (closeError) {
            return { success: false, error: closeError.message };
        }

        const { data: rowAfterClose, error: rowAfterCloseError } = await supabase
            .from(TEAMING_TABLE)
            .select('id, status')
            .eq('id', teamingId)
            .maybeSingle();

        if (rowAfterCloseError) {
            return { success: false, error: rowAfterCloseError.message };
        }

        if (!rowAfterClose || rowAfterClose.status === 'closed') {
            return { success: true };
        }

        return { success: false, error: 'Delete was blocked by database policy. Please apply the latest RLS migration.' };
    } catch (e: any) {
        console.error('Error deleting teaming request:', e);
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
        parentCommentId: data.parent_comment_id,
        replyToName: data.reply_to_name,
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

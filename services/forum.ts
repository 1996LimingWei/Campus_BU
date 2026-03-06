import { ForumCategory, ForumComment, ForumPost, ForumSort } from '../types';
import { supabase } from './supabase';

const FORUM_POSTS = 'forum_posts';
const FORUM_COMMENTS = 'forum_comments';
const FORUM_UPVOTES = 'forum_upvotes';

// ── Mapper ────────────────────────────────────────────────────────────────────
const mapRow = (row: any): ForumPost => {
    let images: string[] = [];
    if (Array.isArray(row.images)) images = row.images;
    else if (typeof row.images === 'string') {
        try { images = JSON.parse(row.images); } catch { }
    }

    return {
        id: row.id,
        title: row.title,
        content: row.content || '',
        authorId: row.author_id,
        authorName: row.author_name,
        authorEmail: row.author_email,
        authorAvatar: row.author_avatar,
        category: row.category as ForumCategory,
        images,
        replyCount: row.reply_count || 0,
        upvoteCount: row.upvote_count || 0,
        isUpvoted: false,
        lastReplyAt: new Date(row.last_reply_at),
        createdAt: new Date(row.created_at),
    };
};

// ── Fetch list ────────────────────────────────────────────────────────────────
export const fetchForumPosts = async (
    category: ForumCategory | 'all' = 'all',
    sort: ForumSort = 'latest_reply',
    currentUserId?: string,
): Promise<ForumPost[]> => {
    let query = supabase.from(FORUM_POSTS).select('*');

    if (category !== 'all') {
        query = query.eq('category', category);
    }

    const orderCol = sort === 'latest_reply' ? 'last_reply_at' : 'created_at';
    query = query.order(orderCol, { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const posts = (data || []).map(mapRow);

    if (currentUserId && posts.length > 0) {
        const ids = posts.map(p => p.id);
        const { data: upvotes } = await supabase
            .from(FORUM_UPVOTES)
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', ids);

        if (upvotes) {
            const set = new Set(upvotes.map((u: any) => u.post_id));
            posts.forEach(p => { p.isUpvoted = set.has(p.id); });
        }
    }

    return posts;
};

// ── Fetch single post ─────────────────────────────────────────────────────────
export const fetchForumPostById = async (
    postId: string,
    currentUserId?: string,
): Promise<ForumPost | null> => {
    const { data, error } = await supabase
        .from(FORUM_POSTS)
        .select('*')
        .eq('id', postId)
        .single();

    if (error || !data) return null;

    const post = mapRow(data);

    if (currentUserId) {
        const { data: upvote } = await supabase
            .from(FORUM_UPVOTES)
            .select('post_id')
            .eq('post_id', postId)
            .eq('user_id', currentUserId)
            .maybeSingle();
        post.isUpvoted = !!upvote;
    }

    return post;
};

// ── Create post ───────────────────────────────────────────────────────────────
export const createForumPost = async (data: {
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    title: string;
    content?: string;
    category: ForumCategory;
    images?: string[];
}): Promise<ForumPost> => {
    const { data: row, error } = await supabase
        .from(FORUM_POSTS)
        .insert([{
            author_id: data.authorId,
            author_name: data.authorName,
            author_email: data.authorEmail,
            author_avatar: data.authorAvatar,
            title: data.title,
            content: data.content || '',
            category: data.category,
            images: data.images || [],
        }])
        .select()
        .single();

    if (error) throw error;
    return mapRow(row);
};

// ── Add comment ───────────────────────────────────────────────────────────────
export const addForumComment = async (data: {
    postId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    content: string;
    parentCommentId?: string;
    replyToName?: string;
}): Promise<ForumComment> => {
    const { data: row, error } = await supabase
        .from(FORUM_COMMENTS)
        .insert([{
            post_id: data.postId,
            author_id: data.authorId,
            author_name: data.authorName,
            author_email: data.authorEmail,
            author_avatar: data.authorAvatar,
            content: data.content,
            parent_comment_id: data.parentCommentId,
            reply_to_name: data.replyToName,
        }])
        .select()
        .single();

    if (error) throw error;

    // Bump reply_count + last_reply_at on the post (manual update, no RPC needed)
    try {
        const { data: postRow } = await supabase
            .from(FORUM_POSTS)
            .select('reply_count')
            .eq('id', data.postId)
            .single();
        if (postRow) {
            await supabase.from(FORUM_POSTS).update({
                reply_count: postRow.reply_count + 1,
                last_reply_at: new Date().toISOString(),
            }).eq('id', data.postId);
        }
    } catch { /* non-blocking */ }

    return {
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorEmail: row.author_email,
        authorAvatar: row.author_avatar,
        content: row.content,
        parentCommentId: row.parent_comment_id,
        replyToName: row.reply_to_name,
        createdAt: new Date(row.created_at),
    };
};

// ── Fetch comments ────────────────────────────────────────────────────────────
export const fetchForumComments = async (postId: string): Promise<ForumComment[]> => {
    const { data, error } = await supabase
        .from(FORUM_COMMENTS)
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorEmail: row.author_email,
        authorAvatar: row.author_avatar,
        content: row.content,
        parentCommentId: row.parent_comment_id,
        replyToName: row.reply_to_name,
        createdAt: new Date(row.created_at),
    }));
};

// ── Toggle upvote ─────────────────────────────────────────────────────────────
export const toggleForumUpvote = async (postId: string, userId: string) => {
    const { data: existing } = await supabase
        .from(FORUM_UPVOTES)
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

    if (existing) {
        await supabase.from(FORUM_UPVOTES).delete().eq('post_id', postId).eq('user_id', userId);
        const { data: post } = await supabase.from(FORUM_POSTS).select('upvote_count').eq('id', postId).single();
        if (post) {
            await supabase.from(FORUM_POSTS).update({ upvote_count: Math.max(0, post.upvote_count - 1) }).eq('id', postId);
        }
        return { upvoted: false };
    } else {
        await supabase.from(FORUM_UPVOTES).insert([{ post_id: postId, user_id: userId }]);
        const { data: post } = await supabase.from(FORUM_POSTS).select('upvote_count').eq('id', postId).single();
        if (post) {
            await supabase.from(FORUM_POSTS).update({ upvote_count: post.upvote_count + 1 }).eq('id', postId);
        }
        return { upvoted: true };
    }
};

// ── Delete post ───────────────────────────────────────────────────────────────
export const deleteForumPost = async (postId: string) => {
    const { error } = await supabase.from(FORUM_POSTS).delete().eq('id', postId);
    if (error) throw error;
};

// ── Delete comment ────────────────────────────────────────────────────────────
export const deleteForumComment = async (commentId: string, postId: string) => {
    const { error } = await supabase.from(FORUM_COMMENTS).delete().eq('id', commentId);
    if (error) throw error;
    const { data: post } = await supabase.from(FORUM_POSTS).select('reply_count').eq('id', postId).single();
    if (post) {
        await supabase.from(FORUM_POSTS).update({ reply_count: Math.max(0, post.reply_count - 1) }).eq('id', postId);
    }
};

// ── Upload image (reuses campus Storage bucket under forum/ prefix) ────────────
export const uploadForumImage = async (uri: string): Promise<string> => {
    const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new TypeError('Network request failed'));
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', uri, true);
        xhr.send(null);
    });

    if (arrayBuffer.byteLength === 0) throw new Error('Image file is empty');

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const filePath = `forum/${fileName}`;

    const { error } = await supabase.storage
        .from('campus')
        .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('campus').getPublicUrl(filePath);
    return publicUrl;
};

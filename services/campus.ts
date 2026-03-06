import { Post, PostCategory, PostComment, PostType } from '../types';
import { getBlockedUserIds } from './moderation';
import { supabase } from './supabase';

const POSTS_TABLE = 'posts';
const COMMENTS_TABLE = 'post_comments';
const LIKES_TABLE = 'post_likes';

const CATEGORY_TO_TYPE: Record<PostCategory, PostType | 'all'> = {
    'All': 'all',
    'Events': 'event',
    'Reviews': 'review',
    'Guides': 'guide',
    'Lost & Found': 'lost_found'
};

const TYPE_TO_CATEGORY: Record<string, PostCategory> = {
    'event': 'Events',
    'review': 'Reviews',
    'guide': 'Guides',
    'lost_found': 'Lost & Found'
};

/**
 * Map Supabase row to Post type
 */
const mapSupabaseToPost = (row: any): Post => {
    // Robust parsing of images array
    let images: string[] = [];
    if (Array.isArray(row.images)) {
        images = row.images;
    } else if (typeof row.images === 'string') {
        try {
            images = JSON.parse(row.images);
        } catch (e) {
            console.error('Failed to parse images string:', row.images);
        }
    }

    const author = row.author; // Joined data from 'users' table

    return {
        id: row.id,
        authorId: row.author_id,
        authorName: (row.is_anonymous || !author) ? row.author_name : (author.display_name || author.displayName),
        authorEmail: row.author_email || (row.is_anonymous || !author ? undefined : author.email),
        authorMajor: (row.is_anonymous || !author) ? row.author_major : author.major,
        authorAvatar: (row.is_anonymous || !author) ? row.author_avatar : author.avatar_url,
        content: row.content,
        category: TYPE_TO_CATEGORY[row.type] || 'All',
        type: row.type as PostType,
        imageUrl: images && images.length > 0 ? images[0] : undefined,
        images: images,
        likes: row.likes || 0,
        comments: row.comments_count || 0,
        isAnonymous: row.is_anonymous || false,
        createdAt: new Date(row.created_at),
        location: row.lat && row.lng ? {
            lat: row.lat,
            lng: row.lng,
            name: row.location_tag || 'Pin Location'
        } : undefined
    };
};

/**
 * Fetch posts by category
 */
export const fetchPosts = async (category: PostCategory = 'All', currentUserId?: string): Promise<Post[]> => {
    let query = supabase.from(POSTS_TABLE).select('*, author:users!author_id(*)');

    const type = CATEGORY_TO_TYPE[category];
    if (type !== 'all') {
        query = query.eq('type', type);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching posts:', error);
        throw error;
    }

    let posts = (data || []).map(mapSupabaseToPost);

    // Filter out posts from blocked users
    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            posts = posts.filter(p => !blockedSet.has(p.authorId));
        }
    }

    // If userId is provided, check which posts the user has liked
    if (currentUserId && posts.length > 0) {
        const postIds = posts.map(p => p.id);
        const { data: likes } = await supabase
            .from(LIKES_TABLE)
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', postIds);

        if (likes) {
            const likedPostIds = new Set(likes.map(l => l.post_id));
            posts.forEach(p => {
                p.isLiked = likedPostIds.has(p.id);
            });
        }
    }

    return posts;
};

/**
 * Fetch a single post by ID
 */
export const fetchPostById = async (postId: string, currentUserId?: string): Promise<Post | null> => {
    const { data, error } = await supabase
        .from(POSTS_TABLE)
        .select('*, author:users!author_id(*)')
        .eq('id', postId)
        .single();

    if (error) {
        console.error('Error fetching post by id:', error);
        return null;
    }

    if (!data) return null;

    const post = mapSupabaseToPost(data);

    // If userId is provided, check if the user has liked this post
    if (currentUserId) {
        const { data: like } = await supabase
            .from(LIKES_TABLE)
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', currentUserId)
            .maybeSingle();

        post.isLiked = !!like;
    }

    return post;
};

/**
 * Create a new post
 */
export const createPost = async (postData: {
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorMajor?: string;
    authorAvatar?: string;
    content: string;
    category: PostCategory;
    images?: string[];
    isAnonymous: boolean;
    location?: { lat: number; lng: number; name?: string };
}) => {
    const insertData = {
        author_id: postData.authorId,
        author_name: postData.isAnonymous ? '匿名用户' : postData.authorName,
        author_email: postData.isAnonymous ? null : postData.authorEmail,
        author_major: postData.isAnonymous ? 'Anonymous' : postData.authorMajor,
        author_avatar: postData.isAnonymous ? null : postData.authorAvatar,
        content: postData.content,
        type: CATEGORY_TO_TYPE[postData.category],
        images: postData.images || [],
        is_anonymous: postData.isAnonymous,
        likes: 0,
        comments_count: 0,
        lat: postData.location?.lat,
        lng: postData.location?.lng,
        location_tag: postData.location?.name || null
    };

    console.log('Inserting post data:', insertData);

    const { data, error } = await supabase
        .from(POSTS_TABLE)
        .insert([insertData])
        .select()
        .single();

    if (error) {
        console.error('Supabase error in createPost:', error);
        throw error;
    }

    // Map to post, but include the email from the input data
    const post = mapSupabaseToPost(data);
    if (!post.isAnonymous) {
        post.authorEmail = postData.authorEmail;
    }
    return post;
};

/**
 * Upload an image to Supabase Storage
 */
export const uploadPostImage = async (uri: string): Promise<string> => {
    try {
        console.log('Starting image upload for URI:', uri);

        // Use ArrayBuffer for more reliable binary handling in some RN environments
        const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function () {
                resolve(xhr.response);
            };
            xhr.onerror = function (e) {
                console.error('XHR Error:', e);
                reject(new TypeError('Network request failed'));
            };
            xhr.responseType = 'arraybuffer';
            xhr.open('GET', uri, true);
            xhr.send(null);
        });

        console.log('Generated ArrayBuffer size:', arrayBuffer.byteLength);

        if (arrayBuffer.byteLength === 0) {
            throw new Error('生成的图片文件为空，请尝试重新选择图片');
        }

        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const filePath = `posts/${fileName}`;

        const { data, error } = await supabase.storage
            .from('campus')
            .upload(filePath, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) {
            console.error('Supabase storage upload error:', error);
            throw error;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('campus')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (e: any) {
        console.error('Network or upload error in uploadPostImage:', e);
        if (e.message === 'Network request failed') {
            throw new Error('网络请求失败，请检查网络连接或尝试更小的图片');
        }
        throw e;
    }
};

/**
 * Toggle like for a post
 */
export const togglePostLike = async (postId: string, userId: string) => {
    try {
        // Check if already liked
        const { data: existingLike } = await supabase
            .from(LIKES_TABLE)
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .single();

        if (existingLike) {
            // Unlike
            await supabase.from(LIKES_TABLE).delete().eq('post_id', postId).eq('user_id', userId);
            return { liked: false };
        } else {
            // Like
            await supabase.from(LIKES_TABLE).insert([{ post_id: postId, user_id: userId }]);

            // Trigger notification
            const { createNotification } = await import('./notifications');
            const { data: postData } = await supabase.from(POSTS_TABLE).select('author_id, content').eq('id', postId).single();
            if (postData && postData.author_id !== userId) {
                await createNotification({
                    user_id: postData.author_id,
                    type: 'like',
                    title: 'notifications.title_like',
                    content: JSON.stringify({
                        key: 'notifications.post_like',
                        params: { content: postData.content.substring(0, 20) }
                    }),
                    related_id: postId,
                });
            }

            return { liked: true };
        }
    } catch (e) {
        console.error('Error toggling like:', e);
        throw e;
    }
};

/**
 * Fetch comments for a post
 */
export const fetchPostComments = async (postId: string): Promise<PostComment[]> => {
    const { data, error } = await supabase
        .from(COMMENTS_TABLE)
        .select('*, author:users!author_id(*)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => ({
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author ? (row.author.display_name || row.author.displayName) : row.author_name,
        authorEmail: row.author_email,
        authorAvatar: row.author_avatar,
        content: row.content,
        parentCommentId: row.parent_comment_id,
        replyToName: row.reply_to_name,
        createdAt: new Date(row.created_at),
    }));
};

/**
 * Add a comment to a post
 */
export const addPostComment = async (commentData: {
    postId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    content: string;
    parentCommentId?: string;
    replyToName?: string;
}): Promise<PostComment> => {
    const { data, error } = await supabase
        .from(COMMENTS_TABLE)
        .insert([{
            post_id: commentData.postId,
            author_id: commentData.authorId,
            author_name: commentData.authorName,
            author_email: commentData.authorEmail,
            author_avatar: commentData.authorAvatar,
            content: commentData.content,
            parent_comment_id: commentData.parentCommentId,
            reply_to_name: commentData.replyToName,
        }])
        .select()
        .single();

    if (error) throw error;

    // Trigger notification
    const { data: post } = await supabase.from(POSTS_TABLE).select('author_id, content').eq('id', commentData.postId).single();
    if (post && post.author_id !== commentData.authorId) {
        const { createNotification } = await import('./notifications');

        // If it's a reply, use a different notification key
        const isReply = !!commentData.parentCommentId;

        await createNotification({
            user_id: post.author_id,
            type: 'comment',
            title: isReply ? 'notifications.title_reply' : 'notifications.title_comment',
            content: JSON.stringify({
                key: isReply ? 'notifications.post_reply' : 'notifications.post_comment',
                params: { name: commentData.authorName }
            }),
            related_id: commentData.postId,
        });
    }

    return {
        id: data.id,
        postId: data.post_id,
        authorId: data.author_id,
        authorName: data.author_name,
        authorEmail: data.author_email,
        authorAvatar: data.author_avatar,
        content: data.content,
        parentCommentId: data.parent_comment_id,
        replyToName: data.reply_to_name,
        createdAt: new Date(data.created_at),
    };
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string) => {
    const { error } = await supabase
        .from(POSTS_TABLE)
        .delete()
        .eq('id', postId);

    if (error) {
        console.error('Error deleting post:', error);
        throw error;
    }
    return true;
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string) => {
    const { error } = await supabase
        .from(COMMENTS_TABLE)
        .delete()
        .eq('id', commentId);

    if (error) {
        console.error('Error deleting comment:', error);
        throw error;
    }
    return true;
};

/**
 * Subscribe to posts (All or by category)
 */
export const subscribeToPosts = (callback: (payload: any) => void) => {
    const channel = supabase
        .channel('public:posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: POSTS_TABLE }, callback)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

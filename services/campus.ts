import { Post, PostCategory, PostComment, PostType } from '../types';
import { ensureContentSafety } from './contentFilter';
import { compressImageForUpload } from '../utils/image';
import { IMMUTABLE_STORAGE_CACHE_CONTROL } from '../utils/remoteImage';
import { getFollowingUserIds } from './follows';
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

const ANONYMOUS_POST_AUTHOR_NAME = '匿名用户';

const mapCommentRow = (
    row: any,
    anonymousPostAuthorId?: string,
): PostComment => {
    const isAnonymous = !!anonymousPostAuthorId && row.author_id === anonymousPostAuthorId;
    const author = row.author;

    return {
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: isAnonymous
            ? ANONYMOUS_POST_AUTHOR_NAME
            : (author ? (author.display_name || author.displayName) : row.author_name),
        authorEmail: isAnonymous ? undefined : row.author_email,
        authorAvatar: isAnonymous ? undefined : row.author_avatar,
        isAnonymous,
        content: row.content,
        parentCommentId: row.parent_comment_id,
        replyToName: row.reply_to_name,
        createdAt: new Date(row.created_at),
    };
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
 * Mark which posts have authors that the current user is following
 */
const markFollowingAuthors = async (posts: Post[], currentUserId?: string) => {
    if (!currentUserId || posts.length === 0) return;

    const followingIds = await getFollowingUserIds(currentUserId);
    if (followingIds.length === 0) return;

    const followingSet = new Set(followingIds);
    posts.forEach(p => {
        p.isFollowingAuthor = followingSet.has(p.authorId);
    });
};

/**
 * Fetch posts by category
 */
export const fetchPosts = async (category?: PostCategory, currentUserId?: string): Promise<Post[]> => {
    let query = supabase.from(POSTS_TABLE).select('*, author:users!author_id(*)');

    const type = CATEGORY_TO_TYPE[category || 'All'];
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

    await markFollowingAuthors(posts, currentUserId);
    return posts;
};

/**
 * Fetch posts created by a specific author.
 */
export const fetchPostsByAuthor = async (authorId: string, currentUserId?: string): Promise<Post[]> => {
    const { data, error } = await supabase
        .from(POSTS_TABLE)
        .select('*, author:users!author_id(*)')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching posts by author:', error);
        throw error;
    }

    let posts = (data || [])
        .map(mapSupabaseToPost)
        .filter(post => !post.isAnonymous);

    // Filter out posts from blocked users
    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            posts = posts.filter(p => !blockedSet.has(p.authorId));
        }
    }

    // Mark current user's like state on these posts
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

    await markFollowingAuthors(posts, currentUserId);
    return posts;
};

/**
 * Fetch anonymous posts created by the current author for private self view.
 */
export const fetchAnonymousPostsByAuthor = async (authorId: string, currentUserId?: string): Promise<Post[]> => {
    if (!currentUserId || currentUserId !== authorId) {
        return [];
    }

    const { data, error } = await supabase
        .from(POSTS_TABLE)
        .select('*, author:users!author_id(*)')
        .eq('author_id', authorId)
        .eq('is_anonymous', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching anonymous posts by author:', error);
        throw error;
    }

    let posts = (data || []).map(mapSupabaseToPost);

    const blockedIds = await getBlockedUserIds(currentUserId);
    if (blockedIds.length > 0) {
        const blockedSet = new Set(blockedIds);
        posts = posts.filter(p => !blockedSet.has(p.authorId));
    }

    if (posts.length > 0) {
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

    await markFollowingAuthors(posts, currentUserId);
    return posts;
};

/**
 * Fetch posts liked by a specific user.
 */
export const fetchLikedPosts = async (userId: string, currentUserId?: string): Promise<Post[]> => {
    const { data: likes, error: likesError } = await supabase
        .from(LIKES_TABLE)
        .select('post_id')
        .eq('user_id', userId);

    if (likesError) {
        console.error('Error fetching liked posts:', likesError);
        throw likesError;
    }

    const likedPostIds = Array.from(new Set((likes || []).map(l => l.post_id)));
    if (likedPostIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from(POSTS_TABLE)
        .select('*, author:users!author_id(*)')
        .in('id', likedPostIds);

    if (error) {
        console.error('Error fetching liked post records:', error);
        throw error;
    }

    let posts = (data || []).map(mapSupabaseToPost);

    // Keep list order aligned with likes list order
    const idOrder = new Map<string, number>();
    likedPostIds.forEach((postId, index) => idOrder.set(postId, index));
    posts.sort((a, b) => (idOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));

    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            posts = posts.filter(p => !blockedSet.has(p.authorId));
        }

        const postIds = posts.map(p => p.id);
        if (postIds.length > 0) {
            const { data: currentUserLikes } = await supabase
                .from(LIKES_TABLE)
                .select('post_id')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);

            const currentLikedSet = new Set((currentUserLikes || []).map(l => l.post_id));
            posts.forEach(p => {
                p.isLiked = currentLikedSet.has(p.id);
            });
        }
    } else {
        const likedSet = new Set(likedPostIds);
        posts.forEach(p => {
            p.isLiked = likedSet.has(p.id);
        });
    }

    await markFollowingAuthors(posts, currentUserId);
    return posts;
};

/**
 * Search posts by query
 */
export const searchPosts = async (queryText: string, currentUserId?: string): Promise<Post[]> => {
    // using user-defined ilike search here. To make it more robust we can search by content or author name
    let query = supabase.from(POSTS_TABLE).select('*, author:users!author_id(*)');

    if (queryText && queryText.trim().length > 0) {
        query = query.or(`content.ilike.%${queryText}%,author_name.ilike.%${queryText}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(20);

    if (error) {
        console.error('Error searching posts:', error);
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

    await markFollowingAuthors(posts, currentUserId);
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

    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.includes(post.authorId)) {
            return null;
        }
    }

    // Mark following status
    if (currentUserId) {
        const followingIds = await getFollowingUserIds(currentUserId);
        post.isFollowingAuthor = followingIds.includes(post.authorId);
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
    ensureContentSafety(postData.content, '帖子包含不符合社区规范的内容，请修改后再发布。');

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
        const compressedUri = await compressImageForUpload(uri, 'feed');
        console.log('Starting image upload for URI:', compressedUri);

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
            xhr.open('GET', compressedUri, true);
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
                cacheControl: IMMUTABLE_STORAGE_CACHE_CONTROL,
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
export const fetchPostComments = async (postId: string, currentUserId?: string): Promise<PostComment[]> => {
    const [{ data, error }, { data: postMeta, error: postError }] = await Promise.all([
        supabase
            .from(COMMENTS_TABLE)
            .select('*, author:users!author_id(*)')
            .eq('post_id', postId)
            .order('created_at', { ascending: true }),
        supabase
            .from(POSTS_TABLE)
            .select('author_id, is_anonymous')
            .eq('id', postId)
            .maybeSingle(),
    ]);

    if (error) throw error;
    if (postError) throw postError;

    const anonymousPostAuthorId = postMeta?.is_anonymous ? postMeta.author_id : undefined;
    let rows = data || [];

    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            rows = rows.filter((row: any) => !blockedSet.has(row.author_id));
        }
    }

    return rows.map(row => mapCommentRow(row, anonymousPostAuthorId));
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
    ensureContentSafety(commentData.content, '评论包含不符合社区规范的内容，请修改后再发布。');

    const { data: post, error: postError } = await supabase
        .from(POSTS_TABLE)
        .select('author_id, content, is_anonymous')
        .eq('id', commentData.postId)
        .single();

    if (postError) throw postError;

    const isAnonymous = !!post?.is_anonymous && post.author_id === commentData.authorId;

    const { data, error } = await supabase
        .from(COMMENTS_TABLE)
        .insert([{
            post_id: commentData.postId,
            author_id: commentData.authorId,
            author_name: isAnonymous ? ANONYMOUS_POST_AUTHOR_NAME : commentData.authorName,
            author_email: isAnonymous ? null : commentData.authorEmail,
            author_avatar: isAnonymous ? null : commentData.authorAvatar,
            content: commentData.content,
            parent_comment_id: commentData.parentCommentId,
            reply_to_name: commentData.replyToName,
        }])
        .select()
        .single();

    if (error) throw error;

    // Trigger notification
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
        ...mapCommentRow(data, isAnonymous ? commentData.authorId : undefined),
        isAnonymous,
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

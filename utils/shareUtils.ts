/**
 * Share utility functions
 * Handles URL generation for sharing posts with environment-based configuration
 */

// Get the base URL from environment variable
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'http://localhost:3000';
const DIRECT_POST_SHARE_PREFIX = '[post_share]';

export type DirectPostSharePayload = {
    postId: string;
    url: string;
    message?: string;
    excerpt?: string;
    imageUrl?: string;
};

/**
 * Generate a shareable URL for a post
 * @param postId - The unique identifier of the post
 * @returns Full URL string for sharing
 * @example
 * generatePostShareUrl('36e64c20-56e1-48fe-8b91-2228d718dd29')
 * // Returns: 'http://localhost:3000/post/36e64c20-56e1-48fe-8b91-2228d718dd29'
 */
export const generatePostShareUrl = (postId: string): string => {
    const url = `${SHARE_BASE_URL}/post/${postId}`;
    console.log('[shareUtils] Generated share URL:', url);
    return url;
};

/**
 * Generate a chat message format for sharing a post
 * Includes the shareable URL and optional custom message
 * @param postId - The unique identifier of the post
 * @param customMessage - Optional custom message from the user
 * @returns Formatted message string for chat
 * @example
 * generatePostShareMessage('abc123', 'Check this out!')
 * // Returns: 'Check this out!\n\nhttp://localhost:3000/post/abc123'
 */
export const generatePostShareMessage = (postId: string, customMessage?: string): string => {
    const shareUrl = generatePostShareUrl(postId);

    if (customMessage?.trim()) {
        return `${customMessage.trim()}\n\n${shareUrl}`;
    }

    return shareUrl;
};

const normalizeExcerpt = (content?: string): string => {
    const text = (content || '').trim().replace(/\s+/g, ' ');
    if (!text) {
        return '';
    }
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

export const generatePostShareMessageContent = (
    postId: string,
    options?: {
        customMessage?: string;
        postContent?: string;
        postImageUrl?: string;
    },
): string => {
    const payload: DirectPostSharePayload = {
        postId,
        url: generatePostShareUrl(postId),
        message: options?.customMessage?.trim() || undefined,
        excerpt: normalizeExcerpt(options?.postContent),
        imageUrl: options?.postImageUrl?.trim() || undefined,
    };

    return `${DIRECT_POST_SHARE_PREFIX}${JSON.stringify(payload)}`;
};

export const parsePostShareMessageContent = (content?: string | null): DirectPostSharePayload | null => {
    if (!content || !content.startsWith(DIRECT_POST_SHARE_PREFIX)) {
        return null;
    }

    try {
        const payload = JSON.parse(content.slice(DIRECT_POST_SHARE_PREFIX.length)) as DirectPostSharePayload;
        if (!payload?.postId || !payload?.url) {
            return null;
        }

        return {
            postId: payload.postId,
            url: payload.url,
            message: payload.message?.trim() || undefined,
            excerpt: normalizeExcerpt(payload.excerpt),
            imageUrl: payload.imageUrl?.trim() || undefined,
        };
    } catch {
        return null;
    }
};

export const isPostShareMessageContent = (content?: string | null): boolean =>
    !!parsePostShareMessageContent(content);

export const getPostShareFallbackText = (payload: DirectPostSharePayload): string => {
    if (payload.message?.trim()) {
        return `${payload.message.trim()}\n\n${payload.url}`;
    }
    return payload.url;
};

export const parseLegacyPostShareMessage = (
    content?: string | null,
): DirectPostSharePayload | null => {
    if (!content) {
        return null;
    }

    const urlMatch = content.match(/https?:\/\/[^\s]+\/post\/([0-9a-zA-Z-]+)/i);
    if (!urlMatch) {
        return null;
    }

    const postId = parsePostIdFromUrl(urlMatch[0]);
    if (!postId) {
        return null;
    }

    const note = content.replace(urlMatch[0], '').trim();
    return {
        postId,
        url: urlMatch[0],
        message: note || undefined,
    };
};

/**
 * Parse a post ID from a share URL
 * @param url - The share URL to parse
 * @returns The post ID if found, null otherwise
 * @example
 * parsePostIdFromUrl('http://localhost:3000/post/abc123')
 * // Returns: 'abc123'
 */
export const parsePostIdFromUrl = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        const match = urlObj.pathname.match(/\/post\/([^/]+)/);
        return match?.[1] || null;
    } catch {
        // If URL parsing fails, try simple regex
        const match = url.match(/\/post\/([^/\s]+)/);
        return match?.[1] || null;
    }
};

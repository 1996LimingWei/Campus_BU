/**
 * Share utility functions
 * Handles URL generation for sharing posts with environment-based configuration
 */

// Get the base URL from environment variable
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'http://localhost:3000';

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

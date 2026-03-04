import storage from '../../lib/storage';
const COOKIE_STORAGE_KEY = 'agent_webview_cookies';

/**
 * Capture and Save Cookies from WebView
 */
export const saveWebViewCookies = async (cookies: string) => {
    try {
        await storage.setItem(COOKIE_STORAGE_KEY, cookies);
        console.log('[Session] Cookies saved successfully');
    } catch (e) {
        console.error('[Session] Failed to save cookies', e);
    }
};

/**
 * Load and Generate Injection Script for Cookies
 */
export const getCookieInjectionScript = async () => {
    try {
        const cookies = await storage.getItem(COOKIE_STORAGE_KEY);
        if (cookies) {
            // Split cookies and inject them one by one
            return cookies.split(';').map((c: string) => {
                return `document.cookie = "${c.trim()}; path=/; domain=.hkbu.edu.hk; expires=Tue, 19 Jan 2038 03:14:07 GMT";`;
            }).join('\n');
        }
    } catch (e) {
        console.error('[Session] Failed to load cookies', e);
    }
    return '';
};

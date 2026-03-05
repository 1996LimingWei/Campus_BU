/**
 * Agent Configuration
 * For production, these should be moved to .env (EXPO_PUBLIC_*)
 */
const rawDeepSeekApiKey = (process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY || '').trim();

const looksLikePlaceholderKey = (key: string): boolean => {
    if (!key) return true;
    const normalized = key.toLowerCase();
    return (
        normalized === 'your_deepseek_api_key' ||
        normalized === 'your_api_key_here' ||
        normalized.includes('your_') ||
        normalized.includes('placeholder')
    );
};

export const AGENT_CONFIG = {
    DEEPSEEK_API_KEY: rawDeepSeekApiKey,
    DEEPSEEK_BASE_URL: process.env.EXPO_PUBLIC_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    DEEPSEEK_ENABLED: !looksLikePlaceholderKey(rawDeepSeekApiKey),
    IS_PROD: false, // Set to true to use real backend proxy in future
};

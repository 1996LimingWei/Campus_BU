import { DAILY_DIGEST_CONFIG } from './config';

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                Accept: 'text/html,application/xhtml+xml',
            },
        });
    } finally {
        clearTimeout(timer);
    }
};

export const fetchDailyDigestSourceHtml = async (url: string): Promise<string> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= DAILY_DIGEST_CONFIG.maxRetries; attempt += 1) {
        try {
            const response = await fetchWithTimeout(url, DAILY_DIGEST_CONFIG.requestTimeoutMs);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`Failed to fetch daily digest source: ${String(lastError)}`);
};

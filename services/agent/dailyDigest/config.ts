export const DAILY_DIGEST_SOURCE_HOST = 'https://ai.hubtoday.app';

export const DAILY_DIGEST_CONFIG = {
    requestTimeoutMs: 12000,
    maxRetries: 2,
    maxItems: 24,
    maxRefsPerLine: 2,
    summaryMaxChars: 220,
    sectionKeywords: ['AI资讯日报多渠道', 'AI 资讯日报多渠道', 'ai资讯日报多渠道'],
};

export const getDailyDigestDate = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const buildDailyDigestSourceUrl = (dateStr: string): string => {
    const [year, month] = dateStr.split('-');
    return `${DAILY_DIGEST_SOURCE_HOST}/${year}-${month}/${dateStr}/`;
};

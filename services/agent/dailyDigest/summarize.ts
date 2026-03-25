import { DAILY_DIGEST_CONFIG } from './config';
import { DigestItem } from './types';

export const buildDailyDigestSummary = (items: DigestItem[], date: string): string => {
    if (items.length === 0) {
        return `${date} 暂未抓取到可用资讯，稍后将自动重试。`;
    }

    const topTitles = items
        .slice(0, 5)
        .map((item) => item.title)
        .join('；');

    const summary = `今日 AI 资讯共 ${items.length} 条，重点包括：${topTitles}。`;

    if (summary.length <= DAILY_DIGEST_CONFIG.summaryMaxChars) {
        return summary;
    }

    return `${summary.slice(0, DAILY_DIGEST_CONFIG.summaryMaxChars - 1)}…`;
};

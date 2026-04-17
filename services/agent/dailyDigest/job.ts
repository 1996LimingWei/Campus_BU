import { composeDailyDigestMessage } from './composeMessage';
import { buildDailyDigestSourceUrl, getDailyDigestDate } from './config';
import { fetchDailyDigestSourceHtml } from './fetchSource';
import { parseDailyDigestItems, parseDailyDigestSummaryText } from './parseSource';
import { sendDailyDigestPush } from './push';
import { getCachedDailyDigest, getDailyDigestEnabled, saveCachedDailyDigest } from './repository';
import { buildDailyDigestSummary } from './summarize';
import { DailyDigestPayload, DigestJobResult } from './types';

const isLegacyListMessage = (message?: string): boolean =>
    Boolean(message && (
        message.includes('相关新闻链接：')
        || message.startsWith('今日摘要\n')
        || message.includes('\n· ')
        || !message.includes('【1】(')
        || !message.startsWith('· ')
        || (message.includes('【1】(') && !/【\d+】\([^)]+\)[、，,；;]/.test(message))
    ));

const hasStructuredLineRefs = (items?: DailyDigestPayload['items']): boolean =>
    Boolean(items && items.length > 0 && items.every((item) => typeof item.lineIndex === 'number' && !!item.contextSnippet));

const isStaleCachedMessage = (payload: DailyDigestPayload): boolean =>
    composeDailyDigestMessage(payload.summary, payload.items) !== payload.message;

const logDailyDigestDebug = (stage: string, payload: {
    userId: string,
    date: string,
    sourceUrl?: string,
    fromCache?: boolean,
    extractedSummary?: string | null,
    summary?: string,
    message?: string,
    items?: DailyDigestPayload['items'],
}) => {
    console.log(`[DailyDigest] ${stage}`, {
        userId: payload.userId,
        date: payload.date,
        sourceUrl: payload.sourceUrl,
        fromCache: payload.fromCache,
        itemCount: payload.items?.length ?? 0,
        summaryLines: payload.extractedSummary?.split('\n').filter(Boolean) ?? [],
        items: payload.items?.map((item, index) => ({
            index: index + 1,
            lineIndex: item.lineIndex,
            title: item.title,
            contextSnippet: item.contextSnippet,
            url: item.url,
        })) ?? [],
        summary: payload.summary,
        message: payload.message,
    });
};

export const runDailyDigestJobForUser = async (
    userId: string,
    date: Date = new Date(),
    options?: { ignoreEnabledCheck?: boolean }
): Promise<DigestJobResult> => {
    if (!userId) {
        return {
            ok: false,
            reason: 'missing_user_id',
        };
    }

    const digestEnabled = await getDailyDigestEnabled(userId);
    if (!options?.ignoreEnabledCheck && !digestEnabled) {
        return {
            ok: false,
            reason: 'disabled',
        };
    }

    const dateStr = getDailyDigestDate(date);
    const cached = await getCachedDailyDigest(userId, dateStr);

    if (cached && cached.items.length > 0 && hasStructuredLineRefs(cached.items) && !isLegacyListMessage(cached.message) && !isStaleCachedMessage(cached)) {
        logDailyDigestDebug('cache_hit', {
            userId,
            date: dateStr,
            sourceUrl: cached.sourceUrl,
            fromCache: true,
            summary: cached.summary,
            message: cached.message,
            items: cached.items,
        });
        await sendDailyDigestPush(userId, cached);
        return {
            ok: true,
            payload: cached,
            fromCache: true,
        };
    }

    try {
        const sourceUrl = buildDailyDigestSourceUrl(dateStr);
        const html = await fetchDailyDigestSourceHtml(sourceUrl);
        const items = parseDailyDigestItems(html, sourceUrl);
        const extractedSummary = parseDailyDigestSummaryText(html);
        const summary = buildDailyDigestSummary(items, dateStr, extractedSummary);
        const message = composeDailyDigestMessage(summary, items);

        const payload: DailyDigestPayload = {
            digestId: `digest_${dateStr}`,
            date: dateStr,
            sourceUrl,
            summary,
            items,
            message,
            createdAt: new Date().toISOString(),
        };

        logDailyDigestDebug('fetched', {
            userId,
            date: dateStr,
            sourceUrl,
            fromCache: false,
            extractedSummary,
            summary,
            message,
            items,
        });

        await saveCachedDailyDigest(userId, payload);
        await sendDailyDigestPush(userId, payload);

        return {
            ok: true,
            payload,
            fromCache: false,
        };
    } catch (error) {
        console.error('[DailyDigest] job failed:', error);
        return {
            ok: false,
            reason: 'job_failed',
        };
    }
};

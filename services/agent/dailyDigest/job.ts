import { composeDailyDigestMessage } from './composeMessage';
import { buildDailyDigestSourceUrl, getDailyDigestDate } from './config';
import { fetchDailyDigestSourceHtml } from './fetchSource';
import { parseDailyDigestItems } from './parseSource';
import { sendDailyDigestPush } from './push';
import { getCachedDailyDigest, saveCachedDailyDigest } from './repository';
import { buildDailyDigestSummary } from './summarize';
import { DailyDigestPayload, DigestJobResult } from './types';

export const runDailyDigestJobForUser = async (
    userId: string,
    date: Date = new Date()
): Promise<DigestJobResult> => {
    if (!userId) {
        return {
            ok: false,
            reason: 'missing_user_id',
        };
    }

    const dateStr = getDailyDigestDate(date);
    const cached = await getCachedDailyDigest(userId, dateStr);

    if (cached) {
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
        const summary = buildDailyDigestSummary(items, dateStr);
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

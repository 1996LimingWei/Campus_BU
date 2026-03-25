import { createNotification } from '../../notifications';
import { isDailyDigestPushSent, markDailyDigestPushSent } from './repository';
import { DailyDigestPayload } from './types';

const buildPushPreview = (summary: string): string => {
    if (summary.length <= 80) {
        return summary;
    }
    return `${summary.slice(0, 79)}…`;
};

export const sendDailyDigestPush = async (userId: string, payload: DailyDigestPayload): Promise<boolean> => {
    if (!userId) {
        return false;
    }

    const alreadySent = await isDailyDigestPushSent(userId, payload.date);
    if (alreadySent) {
        return true;
    }

    await createNotification({
        user_id: userId,
        type: 'system',
        title: `今日AI资讯摘要 ${payload.date}`,
        content: buildPushPreview(payload.summary),
    });

    await markDailyDigestPushSent(userId, payload.date);
    return true;
};

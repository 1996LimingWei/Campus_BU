import { DigestItem } from './types';

export const composeDailyDigestMessage = (summary: string, items: DigestItem[]): string => {
    const lines: string[] = [
        '今日 AI 资讯摘要',
        summary,
        '',
        '相关新闻链接：',
    ];

    items.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.title}`);
        lines.push(item.url);
    });

    return lines.join('\n');
};

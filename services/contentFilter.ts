type ContentViolationCode =
    | 'sexual'
    | 'hate'
    | 'violence'
    | 'harassment'
    | 'spam';

export type ContentFilterResult = {
    ok: boolean;
    code?: ContentViolationCode;
    matchedTerm?: string;
    message?: string;
};

const PATTERNS: Array<{
    code: ContentViolationCode;
    message: string;
    patterns: RegExp[];
}> = [
    {
        code: 'sexual',
        message: '内容包含不允许发布的色情或低俗信息。',
        patterns: [
            /约炮|招嫖|援交|裸聊|色情|黄片|av|porn|sex\s*(service|chat)?/i,
        ],
    },
    {
        code: 'hate',
        message: '内容包含仇恨或歧视性表达。',
        patterns: [
            /种族歧视|nazi|kill\s+all|hate\s+(group|people)|支那|贱种/i,
        ],
    },
    {
        code: 'violence',
        message: '内容包含暴力威胁信息。',
        patterns: [
            /炸学校|杀了你|砍死|爆头|枪击|bomb\s+(school|campus)|kill\s+you/i,
        ],
    },
    {
        code: 'harassment',
        message: '内容包含辱骂、骚扰或霸凌表达。',
        patterns: [
            /骚扰|霸凌|去死|滚开|傻逼|智障|废物|婊子|fuck\s+you/i,
        ],
    },
    {
        code: 'spam',
        message: '内容疑似广告、诈骗或引流。',
        patterns: [
            /加v|vx[:：]?|whatsapp[:：]?|稳赚|代写|刷单|兼职日结|返利|点击链接|彩票计划群|博彩/i,
        ],
    },
];

const normalizeContent = (value?: string | null): string =>
    (value || '').replace(/\s+/g, ' ').trim();

export const checkContentSafety = (content?: string | null): ContentFilterResult => {
    const text = normalizeContent(content);
    if (!text) {
        return { ok: true };
    }

    for (const group of PATTERNS) {
        for (const pattern of group.patterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    ok: false,
                    code: group.code,
                    matchedTerm: match[0],
                    message: group.message,
                };
            }
        }
    }

    return { ok: true };
};

export const ensureContentSafety = (
    content: string | null | undefined,
    fallbackMessage = '内容包含不符合社区规范的信息，请修改后再试。',
) => {
    const result = checkContentSafety(content);
    if (!result.ok) {
        throw new Error(result.message || fallbackMessage);
    }
};

export const ensureMultipleContentsSafety = (values: Array<string | null | undefined>) => {
    for (const value of values) {
        ensureContentSafety(value);
    }
};

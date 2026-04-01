const TAB_LABEL_FALLBACKS = {
    home: '校园圈',
    map: '地图',
    agent: '助手',
    course: '课程',
    me: '我的',
} as const;

type TabLabelKey = keyof typeof TAB_LABEL_FALLBACKS;

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export const getTabLabel = (t: TranslateFn, key: TabLabelKey): string => {
    const fallback = TAB_LABEL_FALLBACKS[key];
    const translated = t(key, { defaultValue: fallback });

    if (!translated || translated === key) {
        return fallback;
    }

    return translated;
};

export { TAB_LABEL_FALLBACKS };

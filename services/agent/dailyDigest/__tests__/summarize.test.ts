import { buildDailyDigestSummary } from '../summarize';

describe('buildDailyDigestSummary', () => {
    it('includes count and major titles', () => {
        const summary = buildDailyDigestSummary([
            { title: 'OpenAI 发布新模型', url: 'https://example.com/1' },
            { title: 'Google 发布 AI 更新', url: 'https://example.com/2' },
        ], '2026-03-26');

        expect(summary).toContain('共 2 条');
        expect(summary).toContain('OpenAI 发布新模型');
    });
});

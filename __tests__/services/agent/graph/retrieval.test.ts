jest.mock('../../../../services/faq', () => ({
    FAQService: {
        searchFAQs: jest.fn().mockReturnValue([]),
        searchKnowledgeBase: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('../../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
}));

import {
    normalizeGraphQuery,
    buildEvidenceItems,
    rankEvidence,
} from '../../../../services/agent/graph/retrieval';

describe('normalizeGraphQuery', () => {
    it('normalizes add drop aliases into canonical retrieval terms', () => {
        const result = normalizeGraphQuery('add drop 怎么弄');
        expect(result.query).toContain('add drop');
        expect(result.aliasTerms).toContain('BUniPort');
    });
});

describe('buildEvidenceItems', () => {
    it('converts faq rows into evidence items', () => {
        const evidence = buildEvidenceItems('faq', [
            { question_zh: 'GPA 怎么算', answer_zh: '按学分加权平均', related_links: ['https://example.com'] },
        ]);

        expect(evidence[0].sourceType).toBe('faq');
        expect(evidence[0].topic).toBe('GPA 怎么算');
    });
});

describe('rankEvidence', () => {
    it('prefers exact query matches with higher trust', () => {
        const ranked = rankEvidence('gpa', [
            {
                id: 'faq-1',
                sourceType: 'faq',
                topic: 'GPA',
                title: 'GPA',
                contentSnippet: 'GPA weighted average',
                score: 0,
                supportsAction: false,
                retrievedAt: '2026-05-17T00:00:00.000Z',
            },
            {
                id: 'memory-1',
                sourceType: 'memory',
                topic: 'favorite_food',
                title: 'favorite_food',
                contentSnippet: 'likes spicy food',
                score: 0,
                supportsAction: false,
                retrievedAt: '2026-05-17T00:00:00.000Z',
            },
        ]);

        expect(ranked[0].sourceType).toBe('faq');
    });
});

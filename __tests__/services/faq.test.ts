jest.mock('../../services/supabase', () => ({
    supabase: {
        rpc: jest.fn(),
        from: jest.fn(),
        functions: {
            invoke: jest.fn(),
        },
    },
}));

import { FAQService } from '../../services/faq';
import { rerankKnowledgeBaseResults } from '../../services/agent/retrieval';
import { supabase } from '../../services/supabase';

describe('FAQ retrieval formatting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reranks knowledge base rows by query relevance', () => {
        const ranked = rerankKnowledgeBaseResults('GPA 怎么算', [
            {
                content: 'Library opening hours vary by semester.',
                metadata: { h2: 'Library' },
            },
            {
                content: 'Semester GPA is calculated by total grade points divided by total credits attempted.',
                metadata: { h2: '评分制度与GPA', h3: 'GPA计算方法' },
            },
        ]);

        expect(ranked[0].content).toContain('Semester GPA');
        expect(ranked[0].score).toBeGreaterThan(0);
    });

    it('builds standardized campus FAQ answers', () => {
        const answer = FAQService.buildCampusFaqAnswer(
            'GPA 怎么算？',
            [{
                id: 'faq-1',
                question: 'How is GPA calculated?',
                question_zh: 'GPA 怎么算？',
                answer: 'Use total grade points divided by total credits.',
                answer_zh: 'GPA 按总绩点除以总学分计算。',
                keywords: ['gpa'],
                related_links: ['https://example.com/gpa'],
            }],
            [{
                content: 'Semester GPA is calculated by total grade points divided by total credits attempted.',
                metadata: { h2: '评分制度与GPA' },
                score: 18,
            }]
        );

        expect(answer).toContain('命中主题：');
        expect(answer).toContain('结论：GPA 按总绩点除以总学分计算。');
        expect(answer).toContain('证据片段：');
        expect(answer).toContain('建议来源：');
    });

    it('prefers stronger knowledge base evidence over weak local FAQ matches', () => {
        const answer = FAQService.buildCampusFaqAnswer(
            'GPA 怎么算？',
            [{
                id: 'faq-weak',
                question: 'What is the library?',
                question_zh: '图书馆是什么？',
                answer: 'Library information.',
                answer_zh: '这是图书馆介绍。',
                keywords: ['library'],
            }],
            [{
                content: 'Semester GPA is calculated by total grade points divided by total credits attempted.',
                metadata: { h2: '评分制度与GPA' },
                score: 18,
            }]
        );

        expect(answer).toContain('结论：Semester GPA is calculated');
        expect(answer).not.toContain('结论：这是图书馆介绍。');
    });

    it('uses edge function retrieval when available', async () => {
        (supabase.functions.invoke as jest.Mock).mockResolvedValue({
            data: {
                data: [
                    {
                        content: 'Semester GPA is calculated by total grade points divided by total credits attempted.',
                        metadata: { h2: '评分制度与GPA' },
                        similarity: 0.92,
                    },
                ],
            },
            error: null,
        });

        const results = await FAQService.searchKnowledgeBase('GPA 怎么算？');

        expect(supabase.functions.invoke).toHaveBeenCalledWith('embed-search', {
            body: { query: 'GPA 怎么算？', match_count: 5 },
        });
        expect(results[0].content).toContain('Semester GPA');
        expect(results[0].score).toBe(0.92);
    });

    it('falls back to keyword search when edge function is unavailable', async () => {
        (supabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('edge function unavailable'));
        const limit = jest.fn().mockResolvedValue({
            data: [
                {
                    content: 'Library opening hours vary by semester.',
                    metadata: { h2: 'Library' },
                },
            ],
            error: null,
        });
        const or = jest.fn(() => ({ limit }));
        const select = jest.fn(() => ({ or }));
        (supabase.from as jest.Mock).mockReturnValue({ select });

        const results = await FAQService.searchKnowledgeBase('图书馆几点开门？');

        expect(supabase.functions.invoke).toHaveBeenCalledWith('embed-search', {
            body: { query: '图书馆几点开门？', match_count: 5 },
        });
        expect(supabase.from).toHaveBeenCalledWith('agent_knowledge_base');
        expect(results[0].content).toContain('Library opening hours');
    });
});

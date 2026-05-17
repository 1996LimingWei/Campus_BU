jest.mock('../../../../services/agent/llm', () => ({
    callDeepSeek: jest.fn(),
    resolveModelName: jest.fn(() => 'mock-fast-model'),
}));

jest.mock('../../../../services/faq', () => ({
    FAQService: {
        searchFAQs: jest.fn().mockReturnValue([{ question_zh: 'GPA 怎么算', answer_zh: '按学分加权平均' }]),
        searchKnowledgeBase: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('../../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
}));

import { callDeepSeek } from '../../../../services/agent/llm';
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { retrieveContextNode } from '../../../../services/agent/graph/nodes/retrieve_context';
import { planNextStepNode } from '../../../../services/agent/graph/nodes/plan_next_step';

describe('retrieveContextNode', () => {
    it('loads ranked evidence into graph state', async () => {
        const start = createInitialAgentGraphState({
            input: 'GPA 怎么算？',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
        });

        const next = await retrieveContextNode({
            ...start,
            normalizedInput: 'gpa 怎么算',
        });

        expect(next.evidence.length).toBeGreaterThan(0);
        expect(next.retrieval.answerability).toBe('sufficient');
    });
});

describe('planNextStepNode', () => {
    it('chooses answer when evidence is sufficient', async () => {
        (callDeepSeek as jest.Mock).mockResolvedValue(JSON.stringify({
            decision: 'answer',
            reason: 'retrieval already contains direct evidence',
            selectedEvidenceIds: ['faq-0'],
        }));

        const state = await retrieveContextNode({
            ...createInitialAgentGraphState({
                input: 'GPA 怎么算？',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            normalizedInput: 'gpa 怎么算',
        });

        const planned = await planNextStepNode(state);
        expect(planned.plan.decision).toBe('answer');
    });
});

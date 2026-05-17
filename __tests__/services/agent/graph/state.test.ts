import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';

describe('createInitialAgentGraphState', () => {
    it('creates a graph state shell from chat context', () => {
        const state = createInitialAgentGraphState({
            input: 'GPA 怎么算？',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [{ role: 'user', content: 'hello' }],
            historySummary: 'recent chat',
            sessionState: {
                facts: {},
                recentDecisions: [],
                openLoops: [],
            },
            deviceLocation: null,
        });

        expect(state.input).toBe('GPA 怎么算？');
        expect(state.normalizedInput).toBe('');
        expect(state.intent.kind).toBe('unknown');
        expect(state.plan.decision).toBe('clarify');
        expect(state.toolCalls).toEqual([]);
        expect(state.toolResults).toEqual([]);
    });
});

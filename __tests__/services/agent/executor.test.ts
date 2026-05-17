import { AgentExecutor } from '../../../services/agent/executor';

jest.mock('../../../services/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                in: jest.fn(() => ({
                    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
                })),
                eq: jest.fn(() => ({
                    maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            insert: jest.fn(() => Promise.resolve({ error: null })),
        })),
    },
}));

const mockRunAgentGraph = jest.fn().mockResolvedValue({
    response: {
        finalAnswer: 'graph answer',
        steps: [{ thought: 'graph runtime used', path: 'llm' }],
    },
    sessionState: { facts: {}, recentDecisions: [], openLoops: [], pendingAction: null },
    finalState: {},
});

jest.mock('../../../services/agent', () => ({
    runAgentGraph: (...args: any[]) => mockRunAgentGraph(...args),
}));

jest.mock('../../../services/agent/llm', () => ({
    callDeepSeek: jest.fn(),
    callDeepSeekStream: jest.fn(),
    resolveModelName: jest.fn((tier: 'fast' | 'reasoning') => tier === 'fast' ? 'mock-fast-model' : 'mock-reasoning-model'),
}));

jest.mock('../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
    getMemoryFact: jest.fn().mockResolvedValue(null),
    saveMemoryFact: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/agent/memory_extractor', () => ({
    extractMemoryCandidatesFromConversation: jest.fn().mockResolvedValue([]),
    filterMemoryCandidates: jest.fn().mockReturnValue([]),
}));

describe('AgentExecutor graph delegation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRunAgentGraph.mockResolvedValue({
            response: {
                finalAnswer: 'graph answer',
                steps: [{ thought: 'graph runtime used', path: 'llm' }],
            },
            sessionState: { facts: {}, recentDecisions: [], openLoops: [], pendingAction: null },
            finalState: {},
        });
    });

    it('delegates process to the graph runtime', async () => {
        const executor = new AgentExecutor('user-1');
        const response = await executor.process('GPA 怎么算？');

        expect(mockRunAgentGraph).toHaveBeenCalledWith(expect.objectContaining({
            input: 'GPA 怎么算？',
            userId: 'user-1',
        }));
        expect(response.finalAnswer).toBe('graph answer');
    });

    it('delegates processWithGraph to the graph runtime entrypoint', async () => {
        const executor = new AgentExecutor('user-1');
        const response = await executor.processWithGraph('GPA 怎么算？');

        expect(mockRunAgentGraph).toHaveBeenCalledWith(expect.objectContaining({
            input: 'GPA 怎么算？',
            userId: 'user-1',
        }));
        expect(response.finalAnswer).toBe('graph answer');
    });

    it('writes back returned session state into executor context', async () => {
        const returnedSessionState = {
            facts: { major: 'CS' },
            recentDecisions: ['answered GPA question'],
            openLoops: [],
            pendingAction: {
                type: 'write_user_schedule_entry',
                params: { title: 'COMP3015', dayOfWeek: 2 },
                missingRequiredFields: ['timeRange'],
                userVisibleSummary: 'Write COMP3015 to schedule',
                safeToExecute: false,
            },
        };
        mockRunAgentGraph.mockResolvedValue({
            response: { finalAnswer: 'ok', steps: [] },
            sessionState: returnedSessionState,
            finalState: {},
        });

        const executor = new AgentExecutor('user-1') as any;
        await executor.process('帮我把 COMP3015 记进课表');

        expect(executor.context.sessionState.pendingAction).toBeDefined();
        expect(executor.context.sessionState.pendingAction?.type).toBe('write_user_schedule_entry');
    });

    it('appends finalAnswer to history after graph run', async () => {
        mockRunAgentGraph.mockResolvedValue({
            response: { finalAnswer: 'graph answer', steps: [] },
            sessionState: { facts: {}, recentDecisions: [], openLoops: [], pendingAction: null },
            finalState: {},
        });

        const executor = new AgentExecutor('user-1') as any;
        await executor.process('hello');

        const history = executor.context.history;
        expect(history[history.length - 1].role).toBe('assistant');
        expect(history[history.length - 1].content).toBe('graph answer');
    });

    it('forwards deviceLocation to graph runtime', async () => {
        mockRunAgentGraph.mockResolvedValue({
            response: { finalAnswer: 'ok', steps: [] },
            sessionState: { facts: {}, recentDecisions: [], openLoops: [], pendingAction: null },
            finalState: {},
        });

        const executor = new AgentExecutor('user-1');
        executor.setDeviceLocation({ latitude: 22.3375, longitude: 114.1833 });
        await executor.process('附近有什么吃的');

        expect(mockRunAgentGraph).toHaveBeenCalledWith(expect.objectContaining({
            deviceLocation: { latitude: 22.3375, longitude: 114.1833 },
        }));
    });

    it('forwards history and historySummary to graph runtime', async () => {
        const executor = new AgentExecutor('user-1') as any;
        executor.pushHistory('user', 'hello');
        executor.pushHistory('assistant', 'hi there');
        executor.pushHistory('user', 'GPA 怎么算？');

        await executor.process('GPA 怎么算？');

        expect(mockRunAgentGraph).toHaveBeenCalledWith(expect.objectContaining({
            history: expect.arrayContaining([
                expect.objectContaining({ role: 'user', content: 'hello' }),
                expect.objectContaining({ role: 'assistant', content: 'hi there' }),
            ]),
        }));
    });
});

jest.mock('@langchain/langgraph', () => {
    const START = '__start__';
    const END = '__end__';

    const Annotation: any = jest.fn(() => ({}));
    Annotation.Root = (spec: any) => ({ spec });

    class StateGraph {
        private nodes: Record<string, (state: any) => Promise<any>> = {};
        private edges: Record<string, string> = {};
        private conditionalEdges: Record<string, (state: any) => string> = {};

        addNode(name: string, fn: (state: any) => Promise<any>) {
            this.nodes[name] = fn;
            return this;
        }

        addEdge(from: string, to: string) {
            this.edges[from] = to;
            return this;
        }

        addConditionalEdges(from: string, fn: (state: any) => string) {
            this.conditionalEdges[from] = fn;
            return this;
        }

        compile() {
            return {
                invoke: async (input: any) => {
                    let current = START;
                    let state = input;

                    for (let guard = 0; guard < 30; guard += 1) {
                        const next = this.edges[current] || this.conditionalEdges[current]?.(state);
                        if (!next || next === END) return state;

                        state = await this.nodes[next](state);
                        current = next;
                    }

                    throw new Error('mock graph exceeded recursion guard');
                },
            };
        }
    }

    return { Annotation, END, START, StateGraph };
});

jest.mock('../../../../services/faq', () => ({
    FAQService: {
        searchFAQs: jest.fn().mockReturnValue([]),
        searchKnowledgeBase: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('../../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../../services/agent/llm', () => ({
    callDeepSeek: jest.fn(),
    resolveModelName: jest.fn(() => 'mock-fast-model'),
}));

jest.mock('../../../../services/agent/graph/tools/calendar_tools', () => ({
    createCalendarEventTool: jest.fn().mockResolvedValue({
        toolName: 'create_user_calendar_event',
        success: true,
        resultSummary: 'calendar event created',
        rawResult: { id: 'event-1' },
        retryable: false,
    }),
}));

jest.mock('../../../../services/agent/graph/tools/schedule_tools', () => ({
    readUserScheduleTool: jest.fn().mockResolvedValue({
        toolName: 'read_user_schedule',
        success: true,
        resultSummary: 'schedule read',
        rawResult: [],
        retryable: false,
    }),
    writeUserScheduleTool: jest.fn().mockResolvedValue({
        toolName: 'write_user_schedule_entry',
        success: true,
        resultSummary: 'schedule entry written',
        rawResult: { id: 'schedule-1' },
        retryable: false,
    }),
}));

jest.mock('../../../../services/agent/graph/tools/course_community_tools', () => ({
    postCourseReviewTool: jest.fn().mockResolvedValue({
        toolName: 'post_course_review',
        success: true,
        resultSummary: 'course review posted',
        rawResult: { id: 'review-1' },
        retryable: false,
    }),
    postCourseTeamingTool: jest.fn().mockResolvedValue({
        toolName: 'post_course_teaming',
        success: true,
        resultSummary: 'course teaming post created',
        rawResult: { id: 'teaming-1' },
        retryable: false,
    }),
    sendCourseChatMessageTool: jest.fn().mockResolvedValue({
        toolName: 'send_course_chat_message',
        success: true,
        resultSummary: 'course chat message sent',
        rawResult: { id: 'message-1' },
        retryable: false,
    }),
}));

jest.mock('../../../../services/agent/memory_extractor', () => ({
    extractMemoryCandidatesFromConversation: jest.fn().mockResolvedValue([]),
    filterMemoryCandidates: jest.fn().mockReturnValue([]),
}));

import { callDeepSeek } from '../../../../services/agent/llm';
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { normalizeInputNode } from '../../../../services/agent/graph/nodes/normalize_input';
import { routeIntentNode } from '../../../../services/agent/graph/nodes/route_intent';
import { clarifyUserNode } from '../../../../services/agent/graph/nodes/clarify_user';
import { synthesizeResponseNode } from '../../../../services/agent/graph/nodes/synthesize_response';
import { createAgentGraphRuntime } from '../../../../services/agent/graph';

describe('normalizeInputNode', () => {
    it('sets normalizedInput using the graph query normalizer', async () => {
        const next = await normalizeInputNode(createInitialAgentGraphState({
            input: 'add drop 怎么弄',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
        }));

        expect(next.normalizedInput).toContain('add drop');
    });
});

describe('routeIntentNode', () => {
    it('marks faq-style campus questions as retrieval-first qa intent', async () => {
        const start = createInitialAgentGraphState({
            input: 'GPA 怎么算？',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
        });

        const normalized = await normalizeInputNode(start);
        const routed = await routeIntentNode(normalized);

        expect(routed.intent.kind).toBe('qa');
        expect(routed.intent.domain).toBe('faq');
        expect(routed.intent.requiresRetrieval).toBe(true);
    });
});

describe('clarifyUserNode', () => {
    it('produces a focused clarification question', async () => {
        (callDeepSeek as jest.Mock).mockResolvedValue(JSON.stringify({
            question: '你是想看这门课的评价、聊天活跃度，还是组队信息？',
            missingSlots: ['community_scope'],
            scope: 'intent',
        }));

        const result = await clarifyUserNode({
            ...createInitialAgentGraphState({
                input: '这门课怎么样',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'clarify',
                reason: 'missing community scope',
                selectedEvidenceIds: [],
            },
        });

        expect(result.clarification.needed).toBe(true);
        expect(result.clarification.question).toContain('评价');
    });
});

describe('synthesizeResponseNode', () => {
    it('returns the clarification question as final response when clarification is pending', async () => {
        const result = await synthesizeResponseNode({
            ...createInitialAgentGraphState({
                input: '这门课怎么样',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            clarification: {
                needed: true,
                question: '你是想看评价还是组队信息？',
                missingSlots: ['community_scope'],
                scope: 'intent',
            },
        });

        expect(result.finalResponse).toBe('你是想看评价还是组队信息？');
    });
});

describe('graph runtime', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns a final AgentResponse for a faq request', async () => {
        (callDeepSeek as jest.Mock)
            .mockResolvedValueOnce(JSON.stringify({
                decision: 'answer',
                reason: 'retrieval already contains direct evidence',
                selectedEvidenceIds: [],
            }))
            .mockResolvedValueOnce('GPA is calculated from weighted grade points.');

        const runtime = createAgentGraphRuntime();
        const result = await runtime.run({
            input: 'GPA 怎么算？',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
        });

        expect(typeof result.finalAnswer).toBe('string');
        expect(Array.isArray(result.steps)).toBe(true);
    });

    it('returns the confirmation prompt without calling synthesis when an action is awaiting confirmation', async () => {
        (callDeepSeek as jest.Mock).mockResolvedValueOnce(JSON.stringify({
            decision: 'act',
            reason: 'user asked to create a calendar event',
            selectedEvidenceIds: [],
            proposedActionType: 'create_user_calendar_event',
        }));

        const runtime = createAgentGraphRuntime();
        const result = await runtime.run({
            input: '帮我记一个 COMP3015 quiz，2026-05-18',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
        });

        expect(result.finalAnswer).toContain('确认');
        expect(result.finalAnswer).toContain('COMP3015');
        expect(result.finalAnswer).toContain('2026-05-18');
    });
});

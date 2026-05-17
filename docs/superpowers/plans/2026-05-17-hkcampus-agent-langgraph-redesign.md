# HKCampus Agent LangGraph Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current monolithic `AgentExecutor` orchestration with a LangGraph-based hybrid assistant runtime that supports structured retrieval, explicit `answer / clarify / act` planning, guarded write actions, and a stable app-facing integration surface.

**Architecture:** Keep the existing business services, chat screen, and domain functions, but move orchestration into a new `services/agent/graph/` runtime. The graph owns state, edges, node execution, retrieval evidence, action preparation, confirmation gating, tool execution, synthesis, and post-response memory writing. The chat screen continues to call one stable agent entrypoint while legacy executor behavior is migrated behind parity-focused tests.

**Tech Stack:** TypeScript, LangGraph, LangChain core types, existing DeepSeek wrapper in `services/agent/llm.ts`, Supabase-backed services, Jest

---

## File Map

- Create: `services/agent/index.ts`
  - Stable public entrypoint that the UI can import instead of instantiating the legacy executor directly.
- Create: `services/agent/graph/index.ts`
  - Compiles and runs the LangGraph app.
- Create: `services/agent/graph/types.ts`
  - Shared graph-specific contracts such as `AgentGraphState`, `EvidenceItem`, `PendingAction`, and `ToolExecutionResult`.
- Create: `services/agent/graph/state.ts`
  - Initial state factory and small state helpers.
- Create: `services/agent/graph/edges.ts`
  - Pure conditional routing helpers for graph transitions.
- Create: `services/agent/graph/telemetry.ts`
  - Lightweight trace helpers for node timing and summaries.
- Create: `services/agent/graph/prompts/planner.ts`
  - Planner prompt builder and parser helpers.
- Create: `services/agent/graph/prompts/clarifier.ts`
  - Clarification prompt builder and parser helpers.
- Create: `services/agent/graph/prompts/synthesizer.ts`
  - Final answer prompt builder.
- Create: `services/agent/graph/retrieval/normalize_query.ts`
  - Query normalization and slot extraction.
- Create: `services/agent/graph/retrieval/retrievers.ts`
  - Source-aware retrieval adapters for FAQ, KB, memory, and session context.
- Create: `services/agent/graph/retrieval/rerank.ts`
  - Evidence scoring and ranking.
- Create: `services/agent/graph/retrieval/evidence.ts`
  - Raw-result-to-evidence transformation.
- Create: `services/agent/graph/tools/faq_tools.ts`
  - FAQ retrieval tool adapter.
- Create: `services/agent/graph/tools/schedule_tools.ts`
  - Schedule read/write adapters.
- Create: `services/agent/graph/tools/calendar_tools.ts`
  - Calendar event adapter.
- Create: `services/agent/graph/tools/course_community_tools.ts`
  - Course community read/write adapters.
- Create: `services/agent/graph/tools/campus_lookup_tools.ts`
  - Building and nearby-place adapters.
- Create: `services/agent/graph/tools/memory_tools.ts`
  - Graph-friendly memory read/write helpers.
- Create: `services/agent/graph/nodes/normalize_input.ts`
- Create: `services/agent/graph/nodes/route_intent.ts`
- Create: `services/agent/graph/nodes/retrieve_context.ts`
- Create: `services/agent/graph/nodes/plan_next_step.ts`
- Create: `services/agent/graph/nodes/clarify_user.ts`
- Create: `services/agent/graph/nodes/prepare_action.ts`
- Create: `services/agent/graph/nodes/confirm_action.ts`
- Create: `services/agent/graph/nodes/execute_tools.ts`
- Create: `services/agent/graph/nodes/synthesize_response.ts`
- Create: `services/agent/graph/nodes/write_memory.ts`
- Modify: `components/agent/AgentChatScreen.tsx`
  - Replace direct `AgentExecutor` import and instantiation with the new entrypoint.
- Modify: `services/agent/executor.ts`
  - Keep as temporary compatibility wrapper during migration or reduce it to a delegator.
- Modify: `services/agent/types.ts`
  - Add graph response contracts that still align with existing `AgentStep` and `AgentResponse`.
- Modify: `__tests__/services/agent/executor.test.ts`
  - Gradually migrate coverage to the new entrypoint while preserving regression intent.
- Create: `__tests__/services/agent/graph/state.test.ts`
- Create: `__tests__/services/agent/graph/edges.test.ts`
- Create: `__tests__/services/agent/graph/retrieval.test.ts`
- Create: `__tests__/services/agent/graph/planner.test.ts`
- Create: `__tests__/services/agent/graph/actions.test.ts`
- Create: `__tests__/services/agent/graph/runtime.test.ts`

## Task 1: Define Graph Types, State, and Public Entry Surface

**Files:**
- Create: `services/agent/index.ts`
- Create: `services/agent/graph/types.ts`
- Create: `services/agent/graph/state.ts`
- Create: `__tests__/services/agent/graph/state.test.ts`
- Modify: `services/agent/types.ts`

- [ ] **Step 1: Write the failing state contract tests**

Create `__tests__/services/agent/graph/state.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/state.test.ts`

Expected: FAIL because the graph state module does not exist yet.

- [ ] **Step 3: Add graph types and initial state**

Create `services/agent/graph/types.ts`:

```ts
import type {
    AgentGeoPoint,
    AgentHistoryItem,
    AgentResponse,
    AgentSessionState,
    AgentStep,
    MemoryCandidate,
} from '../types';

export type GraphIntentKind = 'unknown' | 'qa' | 'action' | 'hybrid' | 'unsupported';
export type GraphDomain =
    | 'faq'
    | 'course_community'
    | 'schedule'
    | 'calendar'
    | 'campus'
    | 'memory'
    | 'mixed'
    | 'unknown';

export type EvidenceSourceType =
    | 'faq'
    | 'knowledge_base'
    | 'memory'
    | 'session_state'
    | 'course_data'
    | 'tool_prefetch';

export type PlannerDecision = 'answer' | 'clarify' | 'act';

export type EvidenceItem = {
    id: string;
    sourceType: EvidenceSourceType;
    topic: string;
    title: string;
    contentSnippet: string;
    fullContentRef?: string;
    metadata?: Record<string, any>;
    score: number;
    supportsAction: boolean;
    retrievedAt: string;
};

export type GraphIntentState = {
    kind: GraphIntentKind;
    domain: GraphDomain;
    requiresRetrieval: boolean;
    requiresActionPreparation: boolean;
    requiresConfirmation: boolean;
    confidence: number;
    reason: string;
};

export type GraphRetrievalState = {
    query: string;
    expandedQueries: string[];
    sourcesRequested: Array<'faq' | 'knowledge_base' | 'memory' | 'session_context' | 'course_context'>;
    rawResults: Record<string, any[]>;
    rankedEvidence: EvidenceItem[];
    answerability: 'unknown' | 'sufficient' | 'insufficient' | 'ambiguous';
    answerabilityReason: string;
};

export type GraphPlanState = {
    decision: PlannerDecision;
    reason: string;
    selectedEvidenceIds: string[];
    proposedActionType?: PendingAction['type'];
};

export type ClarificationState = {
    needed: boolean;
    question?: string;
    missingSlots: string[];
    scope?: 'intent' | 'action_parameters' | 'confirmation' | 'retrieval_disambiguation';
};

export type PendingAction =
    | {
        type: 'post_course_review';
        params: { courseCode?: string; rating?: number; content?: string };
        missingRequiredFields: string[];
        userVisibleSummary: string;
        safeToExecute: boolean;
    }
    | {
        type: 'post_course_teaming';
        params: { courseCode?: string; section?: string; content?: string };
        missingRequiredFields: string[];
        userVisibleSummary: string;
        safeToExecute: boolean;
    }
    | {
        type: 'send_course_chat_message';
        params: { courseCode?: string; content?: string };
        missingRequiredFields: string[];
        userVisibleSummary: string;
        safeToExecute: boolean;
    }
    | {
        type: 'write_user_schedule_entry';
        params: {
            title?: string;
            dayOfWeek?: number;
            courseCode?: string;
            startTime?: string;
            endTime?: string;
            startPeriod?: number;
            endPeriod?: number;
            room?: string;
            weekText?: string;
        };
        missingRequiredFields: string[];
        userVisibleSummary: string;
        safeToExecute: boolean;
    }
    | {
        type: 'create_user_calendar_event';
        params: {
            title?: string;
            eventType?: 'exam' | 'quiz' | 'assignment' | 'custom';
            eventDate?: string;
            courseCode?: string;
            startTime?: string;
            endTime?: string;
            location?: string;
            note?: string;
        };
        missingRequiredFields: string[];
        userVisibleSummary: string;
        safeToExecute: boolean;
    };

export type PreparedToolCall = {
    toolName: string;
    input: Record<string, any>;
};

export type ToolExecutionResult = {
    toolName: string;
    success: boolean;
    resultSummary: string;
    rawResult: any;
    userVisibleData?: Record<string, any>;
    retryable: boolean;
};

export type AgentGraphState = {
    input: string;
    normalizedInput: string;
    sessionId: string;
    userId: string;
    history: AgentHistoryItem[];
    historySummary?: string;
    sessionState: AgentSessionState;
    deviceLocation?: AgentGeoPoint | null;
    intent: GraphIntentState;
    retrieval: GraphRetrievalState;
    evidence: EvidenceItem[];
    plan: GraphPlanState;
    clarification: ClarificationState;
    pendingAction: PendingAction | null;
    confirmation: {
        required: boolean;
        satisfied: boolean;
        prompt?: string;
    };
    toolCalls: PreparedToolCall[];
    toolResults: ToolExecutionResult[];
    finalResponse?: string;
    memoryCandidates: MemoryCandidate[];
    steps: AgentStep[];
    trace: Array<{ node: string; summary: string }>;
    errors: string[];
};

export type GraphEntryInput = {
    input: string;
    userId: string;
    sessionId: string;
    history: AgentHistoryItem[];
    historySummary?: string;
    sessionState: AgentSessionState;
    deviceLocation?: AgentGeoPoint | null;
};

export type GraphRuntime = {
    run(input: GraphEntryInput): Promise<AgentResponse>;
};
```

Create `services/agent/graph/state.ts`:

```ts
import type { GraphEntryInput, AgentGraphState } from './types';

export const createInitialAgentGraphState = (input: GraphEntryInput): AgentGraphState => ({
    input: input.input,
    normalizedInput: '',
    sessionId: input.sessionId,
    userId: input.userId,
    history: input.history,
    historySummary: input.historySummary,
    sessionState: input.sessionState,
    deviceLocation: input.deviceLocation ?? null,
    intent: {
        kind: 'unknown',
        domain: 'unknown',
        requiresRetrieval: false,
        requiresActionPreparation: false,
        requiresConfirmation: false,
        confidence: 0,
        reason: 'not classified yet',
    },
    retrieval: {
        query: '',
        expandedQueries: [],
        sourcesRequested: [],
        rawResults: {},
        rankedEvidence: [],
        answerability: 'unknown',
        answerabilityReason: 'retrieval not run yet',
    },
    evidence: [],
    plan: {
        decision: 'clarify',
        reason: 'planner not run yet',
        selectedEvidenceIds: [],
    },
    clarification: {
        needed: false,
        missingSlots: [],
    },
    pendingAction: null,
    confirmation: {
        required: false,
        satisfied: false,
    },
    toolCalls: [],
    toolResults: [],
    finalResponse: undefined,
    memoryCandidates: [],
    steps: [],
    trace: [],
    errors: [],
});
```

Create `services/agent/index.ts`:

```ts
import type { GraphEntryInput } from './graph/types';
import { createAgentGraphRuntime } from './graph';

export const runAgentGraph = async (input: GraphEntryInput) => {
    const runtime = createAgentGraphRuntime();
    return runtime.run(input);
};
```

Add a small compatibility export in `services/agent/types.ts` if needed:

```ts
export type AgentRuntimeResponse = AgentResponse;
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm test -- --runInBand __tests__/services/agent/graph/state.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/index.ts services/agent/graph/types.ts services/agent/graph/state.ts services/agent/types.ts __tests__/services/agent/graph/state.test.ts
git commit -m "refactor: add langgraph agent state contracts"
```

## Task 2: Add Pure Edge Helpers and Trace Utilities

**Files:**
- Create: `services/agent/graph/edges.ts`
- Create: `services/agent/graph/telemetry.ts`
- Create: `__tests__/services/agent/graph/edges.test.ts`

- [ ] **Step 1: Write the failing edge tests**

Create `__tests__/services/agent/graph/edges.test.ts`:

```ts
import {
    getIntentBranch,
    getPlannerBranch,
    getPostPrepareBranch,
    getConfirmationBranch,
} from '../../../../services/agent/graph/edges';

describe('graph edge helpers', () => {
    it('routes unsupported intent directly to synthesis', () => {
        expect(getIntentBranch({
            kind: 'unsupported',
            requiresRetrieval: false,
        } as any)).toBe('synthesize_response');
    });

    it('routes retrieval intents into retrieve_context', () => {
        expect(getIntentBranch({
            kind: 'qa',
            requiresRetrieval: true,
        } as any)).toBe('retrieve_context');
    });

    it('routes planner act decision into prepare_action', () => {
        expect(getPlannerBranch({ decision: 'act' } as any)).toBe('prepare_action');
    });

    it('routes incomplete actions into clarify_user', () => {
        expect(getPostPrepareBranch({
            missingRequiredFields: ['eventDate'],
        } as any)).toBe('clarify_user');
    });

    it('routes unsatisfied confirmation back to synthesis', () => {
        expect(getConfirmationBranch({
            required: true,
            satisfied: false,
        })).toBe('synthesize_response');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/edges.test.ts`

Expected: FAIL because the edge helpers do not exist.

- [ ] **Step 3: Implement edge helpers and trace helper**

Create `services/agent/graph/edges.ts`:

```ts
import type {
    GraphIntentState,
    GraphPlanState,
    PendingAction,
} from './types';

export const getIntentBranch = (
    intent: Pick<GraphIntentState, 'kind' | 'requiresRetrieval'>
) => {
    if (intent.kind === 'unsupported') return 'synthesize_response';
    if (intent.requiresRetrieval) return 'retrieve_context';
    return 'plan_next_step';
};

export const getPlannerBranch = (
    plan: Pick<GraphPlanState, 'decision'>
) => {
    if (plan.decision === 'answer') return 'synthesize_response';
    if (plan.decision === 'clarify') return 'clarify_user';
    return 'prepare_action';
};

export const getPostPrepareBranch = (pendingAction: PendingAction | null) => {
    if (!pendingAction) return 'clarify_user';
    if (pendingAction.missingRequiredFields.length > 0) return 'clarify_user';
    return 'confirm_action';
};

export const getConfirmationBranch = (
    confirmation: { required: boolean; satisfied: boolean }
) => {
    if (confirmation.required && !confirmation.satisfied) return 'synthesize_response';
    return 'execute_tools';
};
```

Create `services/agent/graph/telemetry.ts`:

```ts
import type { AgentGraphState } from './types';

export const pushTrace = (
    state: AgentGraphState,
    node: string,
    summary: string
): AgentGraphState => ({
    ...state,
    trace: [...state.trace, { node, summary }],
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/edges.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/edges.ts services/agent/graph/telemetry.ts __tests__/services/agent/graph/edges.test.ts
git commit -m "refactor: add langgraph routing helpers"
```

## Task 3: Build Query Normalization and Evidence Retrieval Pipeline

**Files:**
- Create: `services/agent/graph/retrieval/normalize_query.ts`
- Create: `services/agent/graph/retrieval/evidence.ts`
- Create: `services/agent/graph/retrieval/rerank.ts`
- Create: `services/agent/graph/retrieval/retrievers.ts`
- Create: `__tests__/services/agent/graph/retrieval.test.ts`

- [ ] **Step 1: Write the failing retrieval tests**

Create `__tests__/services/agent/graph/retrieval.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/retrieval.test.ts`

Expected: FAIL because the retrieval modules do not exist yet.

- [ ] **Step 3: Implement normalization, evidence conversion, and ranking**

Create `services/agent/graph/retrieval/normalize_query.ts`:

```ts
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const addAliasTerms = (query: string, terms: Set<string>) => {
    if (/add drop|add\/drop|选课|加退课/i.test(query)) {
        ['add drop', 'BUniPort', 'course registration'].forEach(term => terms.add(term));
    }

    if (/gpa|绩点/i.test(query)) {
        ['gpa', 'grade point average'].forEach(term => terms.add(term));
    }
};

export const normalizeGraphQuery = (input: string) => {
    const query = normalize(input);
    const aliasTerms = new Set(query.split(' ').filter(Boolean));
    addAliasTerms(query, aliasTerms);

    return {
        query,
        aliasTerms: Array.from(aliasTerms),
    };
};
```

Create `services/agent/graph/retrieval/evidence.ts`:

```ts
import type { EvidenceItem, EvidenceSourceType } from '../types';

export const buildEvidenceItems = (
    sourceType: EvidenceSourceType,
    rows: any[]
): EvidenceItem[] => {
    const now = new Date().toISOString();

    return rows.map((row, index) => ({
        id: `${sourceType}-${index}`,
        sourceType,
        topic: row.question_zh || row.title || row.metadata?.h2 || row.key || 'unknown topic',
        title: row.question_zh || row.title || row.key || 'Untitled',
        contentSnippet: row.answer_zh || row.content || row.value || '',
        fullContentRef: row.url || row.id || undefined,
        metadata: row.metadata || undefined,
        score: 0,
        supportsAction: sourceType === 'course_data' || sourceType === 'session_state',
        retrievedAt: now,
    }));
};
```

Create `services/agent/graph/retrieval/rerank.ts`:

```ts
import type { EvidenceItem } from '../types';

const trustWeight: Record<EvidenceItem['sourceType'], number> = {
    faq: 5,
    knowledge_base: 4,
    course_data: 4,
    session_state: 3,
    tool_prefetch: 3,
    memory: 1,
};

export const rankEvidence = (query: string, evidence: EvidenceItem[]) => {
    const normalized = query.toLowerCase();

    return evidence
        .map(item => {
            let score = trustWeight[item.sourceType] || 0;

            if (item.topic.toLowerCase().includes(normalized)) score += 5;
            if (item.contentSnippet.toLowerCase().includes(normalized)) score += 3;

            return {
                ...item,
                score,
            };
        })
        .sort((a, b) => b.score - a.score);
};
```

Create `services/agent/graph/retrieval/retrievers.ts`:

```ts
import { FAQService } from '../../faq';
import { getAllUserFacts } from '../memory';
import type { AgentGraphState } from '../types';
import { buildEvidenceItems } from './evidence';
import { normalizeGraphQuery } from './normalize_query';
import { rankEvidence } from './rerank';

export const retrieveEvidenceBundle = async (state: AgentGraphState) => {
    const normalized = normalizeGraphQuery(state.normalizedInput || state.input);
    const localFaq = await Promise.resolve(FAQService.searchFAQs(normalized.query));
    const knowledgeBase = await FAQService.searchKnowledgeBase(normalized.query);
    const memoryFacts = await getAllUserFacts(state.userId);
    const memoryRows = Object.entries(memoryFacts).map(([key, value]) => ({ key, value }));

    const rawResults = {
        faq: localFaq,
        knowledge_base: knowledgeBase,
        memory: memoryRows,
    };

    const evidence = rankEvidence(normalized.query, [
        ...buildEvidenceItems('faq', localFaq),
        ...buildEvidenceItems('knowledge_base', knowledgeBase),
        ...buildEvidenceItems('memory', memoryRows),
    ]);

    return {
        normalized,
        rawResults,
        evidence,
    };
};
```

Create `services/agent/graph/retrieval/index.ts`:

```ts
export { buildEvidenceItems } from './evidence';
export { normalizeGraphQuery } from './normalize_query';
export { rankEvidence } from './rerank';
export { retrieveEvidenceBundle } from './retrievers';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/retrieval.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/retrieval services/agent/graph/retrieval/index.ts __tests__/services/agent/graph/retrieval.test.ts
git commit -m "feat: add langgraph retrieval evidence pipeline"
```

## Task 4: Implement Normalize and Route Nodes

**Files:**
- Create: `services/agent/graph/nodes/normalize_input.ts`
- Create: `services/agent/graph/nodes/route_intent.ts`
- Modify: `services/agent/router.ts`
- Create: `__tests__/services/agent/graph/runtime.test.ts`

- [ ] **Step 1: Write the failing normalize and route node tests**

Add this first block to `__tests__/services/agent/graph/runtime.test.ts`:

```ts
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { normalizeInputNode } from '../../../../services/agent/graph/nodes/normalize_input';
import { routeIntentNode } from '../../../../services/agent/graph/nodes/route_intent';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: FAIL because the nodes do not exist yet.

- [ ] **Step 3: Implement normalize and route nodes**

Create `services/agent/graph/nodes/normalize_input.ts`:

```ts
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';
import { normalizeGraphQuery } from '../retrieval';

export const normalizeInputNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const normalized = normalizeGraphQuery(state.input);

    return pushTrace(
        {
            ...state,
            normalizedInput: normalized.query,
        },
        'normalize_input',
        `normalized=${normalized.query}`
    );
};
```

Create `services/agent/graph/nodes/route_intent.ts`:

```ts
import { classifyIntent } from '../../router';
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';

const mapIntent = (decision: ReturnType<typeof classifyIntent>) => {
    if (decision.intent === 'campus_faq') {
        return {
            kind: 'qa' as const,
            domain: 'faq' as const,
            requiresRetrieval: true,
            requiresActionPreparation: false,
            requiresConfirmation: false,
        };
    }

    if (decision.intent === 'course_community_write') {
        return {
            kind: 'action' as const,
            domain: 'course_community' as const,
            requiresRetrieval: false,
            requiresActionPreparation: true,
            requiresConfirmation: true,
        };
    }

    if (decision.intent === 'schedule_query') {
        return {
            kind: 'qa' as const,
            domain: 'schedule' as const,
            requiresRetrieval: false,
            requiresActionPreparation: false,
            requiresConfirmation: false,
        };
    }

    if (decision.intent === 'building_query' || decision.intent === 'nearby_place_query') {
        return {
            kind: 'qa' as const,
            domain: 'campus' as const,
            requiresRetrieval: false,
            requiresActionPreparation: false,
            requiresConfirmation: false,
        };
    }

    return {
        kind: 'hybrid' as const,
        domain: 'mixed' as const,
        requiresRetrieval: true,
        requiresActionPreparation: false,
        requiresConfirmation: false,
    };
};

export const routeIntentNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const decision = classifyIntent(state.normalizedInput || state.input);
    const mapped = mapIntent(decision);

    return pushTrace(
        {
            ...state,
            intent: {
                ...mapped,
                confidence: decision.confidence,
                reason: decision.reason,
            },
        },
        'route_intent',
        `${mapped.kind}/${mapped.domain}`
    );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: PASS for the normalize and route cases.

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/nodes/normalize_input.ts services/agent/graph/nodes/route_intent.ts __tests__/services/agent/graph/runtime.test.ts
git commit -m "feat: add langgraph normalize and intent route nodes"
```

## Task 5: Implement Retrieval and Planner Nodes

**Files:**
- Create: `services/agent/graph/prompts/planner.ts`
- Create: `services/agent/graph/nodes/retrieve_context.ts`
- Create: `services/agent/graph/nodes/plan_next_step.ts`
- Create: `__tests__/services/agent/graph/planner.test.ts`

- [ ] **Step 1: Write the failing planner tests**

Create `__tests__/services/agent/graph/planner.test.ts`:

```ts
import { callDeepSeek } from '../../../../services/agent/llm';
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { retrieveContextNode } from '../../../../services/agent/graph/nodes/retrieve_context';
import { planNextStepNode } from '../../../../services/agent/graph/nodes/plan_next_step';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/planner.test.ts`

Expected: FAIL because the retrieval and planner nodes do not exist yet.

- [ ] **Step 3: Implement retrieval and planner nodes**

Create `services/agent/graph/nodes/retrieve_context.ts`:

```ts
import type { AgentGraphState } from '../types';
import { retrieveEvidenceBundle } from '../retrieval';
import { pushTrace } from '../telemetry';

export const retrieveContextNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const bundle = await retrieveEvidenceBundle(state);
    const answerability = bundle.evidence.length > 0 ? 'sufficient' : 'insufficient';

    return pushTrace(
        {
            ...state,
            retrieval: {
                query: bundle.normalized.query,
                expandedQueries: bundle.normalized.aliasTerms,
                sourcesRequested: ['faq', 'knowledge_base', 'memory'],
                rawResults: bundle.rawResults,
                rankedEvidence: bundle.evidence,
                answerability,
                answerabilityReason: answerability === 'sufficient'
                    ? 'evidence available'
                    : 'no evidence found',
            },
            evidence: bundle.evidence,
        },
        'retrieve_context',
        `evidence=${bundle.evidence.length}`
    );
};
```

Create `services/agent/graph/prompts/planner.ts`:

```ts
import type { AgentGraphState } from '../types';

export const buildPlannerPrompt = (state: AgentGraphState) => [
    {
        role: 'system',
        content: [
            'You are the planner for the HKCampus agent.',
            'Choose exactly one of: answer, clarify, act.',
            'Return JSON only with keys: decision, reason, selectedEvidenceIds, proposedActionType.',
            'Do not invent evidence IDs.',
        ].join(' '),
    },
    {
        role: 'user',
        content: JSON.stringify({
            input: state.input,
            normalizedInput: state.normalizedInput,
            intent: state.intent,
            retrieval: {
                answerability: state.retrieval.answerability,
                answerabilityReason: state.retrieval.answerabilityReason,
            },
            evidence: state.evidence.map(item => ({
                id: item.id,
                topic: item.topic,
                sourceType: item.sourceType,
                contentSnippet: item.contentSnippet,
            })),
        }),
    },
];
```

Create `services/agent/graph/nodes/plan_next_step.ts`:

```ts
import { callDeepSeek, resolveModelName } from '../../llm';
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';
import { buildPlannerPrompt } from '../prompts/planner';

export const planNextStepNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const raw = await callDeepSeek(buildPlannerPrompt(state), {
        model: resolveModelName('fast'),
    });
    const parsed = JSON.parse(raw);

    return pushTrace(
        {
            ...state,
            plan: {
                decision: parsed.decision,
                reason: parsed.reason,
                selectedEvidenceIds: parsed.selectedEvidenceIds || [],
                proposedActionType: parsed.proposedActionType,
            },
        },
        'plan_next_step',
        `decision=${parsed.decision}`
    );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/planner.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/prompts/planner.ts services/agent/graph/nodes/retrieve_context.ts services/agent/graph/nodes/plan_next_step.ts __tests__/services/agent/graph/planner.test.ts
git commit -m "feat: add langgraph retrieval and planner nodes"
```

## Task 6: Implement Clarification and Response Synthesis

**Files:**
- Create: `services/agent/graph/prompts/clarifier.ts`
- Create: `services/agent/graph/prompts/synthesizer.ts`
- Create: `services/agent/graph/nodes/clarify_user.ts`
- Create: `services/agent/graph/nodes/synthesize_response.ts`
- Modify: `__tests__/services/agent/graph/runtime.test.ts`

- [ ] **Step 1: Add the failing clarification and synthesis tests**

Append to `__tests__/services/agent/graph/runtime.test.ts`:

```ts
import { callDeepSeek } from '../../../../services/agent/llm';
import { clarifyUserNode } from '../../../../services/agent/graph/nodes/clarify_user';
import { synthesizeResponseNode } from '../../../../services/agent/graph/nodes/synthesize_response';

jest.mock('../../../../services/agent/llm', () => ({
    callDeepSeek: jest.fn(),
    resolveModelName: jest.fn(() => 'mock-fast-model'),
}));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: FAIL because the clarification and synthesis nodes do not exist yet.

- [ ] **Step 3: Implement the nodes**

Create `services/agent/graph/prompts/clarifier.ts`:

```ts
import type { AgentGraphState } from '../types';

export const buildClarifierPrompt = (state: AgentGraphState) => [
    {
        role: 'system',
        content: [
            'You ask one focused clarification question for the HKCampus agent.',
            'Return JSON only with keys: question, missingSlots, scope.',
            'Ask for the smallest next piece of information needed.',
        ].join(' '),
    },
    {
        role: 'user',
        content: JSON.stringify({
            input: state.input,
            intent: state.intent,
            plan: state.plan,
            pendingAction: state.pendingAction,
        }),
    },
];
```

Create `services/agent/graph/prompts/synthesizer.ts`:

```ts
import type { AgentGraphState } from '../types';

export const buildSynthesizerPrompt = (state: AgentGraphState) => [
    {
        role: 'system',
        content: [
            'You write the final user-facing response for the HKCampus agent.',
            'Use provided evidence and tool results only.',
            'Be concise and campus-specific.',
        ].join(' '),
    },
    {
        role: 'user',
        content: JSON.stringify({
            input: state.input,
            selectedEvidence: state.evidence
                .filter(item => state.plan.selectedEvidenceIds.includes(item.id))
                .map(item => ({
                    topic: item.topic,
                    contentSnippet: item.contentSnippet,
                })),
            toolResults: state.toolResults,
        }),
    },
];
```

Create `services/agent/graph/nodes/clarify_user.ts`:

```ts
import { callDeepSeek, resolveModelName } from '../../llm';
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';
import { buildClarifierPrompt } from '../prompts/clarifier';

export const clarifyUserNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const raw = await callDeepSeek(buildClarifierPrompt(state), {
        model: resolveModelName('fast'),
    });
    const parsed = JSON.parse(raw);

    return pushTrace(
        {
            ...state,
            clarification: {
                needed: true,
                question: parsed.question,
                missingSlots: parsed.missingSlots || [],
                scope: parsed.scope,
            },
        },
        'clarify_user',
        parsed.question
    );
};
```

Create `services/agent/graph/nodes/synthesize_response.ts`:

```ts
import { callDeepSeek, resolveModelName } from '../../llm';
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';
import { buildSynthesizerPrompt } from '../prompts/synthesizer';

export const synthesizeResponseNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    if (state.clarification.needed && state.clarification.question) {
        return pushTrace(
            {
                ...state,
                finalResponse: state.clarification.question,
            },
            'synthesize_response',
            'clarification response'
        );
    }

    const raw = await callDeepSeek(buildSynthesizerPrompt(state), {
        model: resolveModelName('fast'),
    });

    return pushTrace(
        {
            ...state,
            finalResponse: raw,
        },
        'synthesize_response',
        'llm synthesis'
    );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: PASS for the clarification and direct synthesis cases.

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/prompts/clarifier.ts services/agent/graph/prompts/synthesizer.ts services/agent/graph/nodes/clarify_user.ts services/agent/graph/nodes/synthesize_response.ts __tests__/services/agent/graph/runtime.test.ts
git commit -m "feat: add langgraph clarification and synthesis nodes"
```

## Task 7: Implement Action Preparation, Confirmation, and Tool Adapters

**Files:**
- Create: `services/agent/graph/tools/schedule_tools.ts`
- Create: `services/agent/graph/tools/calendar_tools.ts`
- Create: `services/agent/graph/tools/course_community_tools.ts`
- Create: `services/agent/graph/nodes/prepare_action.ts`
- Create: `services/agent/graph/nodes/confirm_action.ts`
- Create: `__tests__/services/agent/graph/actions.test.ts`

- [ ] **Step 1: Write the failing action tests**

Create `__tests__/services/agent/graph/actions.test.ts`:

```ts
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { prepareActionNode } from '../../../../services/agent/graph/nodes/prepare_action';
import { confirmActionNode } from '../../../../services/agent/graph/nodes/confirm_action';

describe('prepareActionNode', () => {
    it('extracts a calendar event action and marks missing date as clarification-needed', async () => {
        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '帮我把 COMP3015 的 quiz 记到日历里',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'user asked to create an event',
                selectedEvidenceIds: [],
                proposedActionType: 'create_user_calendar_event',
            },
        });

        expect(result.pendingAction?.type).toBe('create_user_calendar_event');
        expect(result.pendingAction?.missingRequiredFields).toContain('eventDate');
    });
});

describe('confirmActionNode', () => {
    it('requires confirmation before write execution', async () => {
        const state = await confirmActionNode({
            ...createInitialAgentGraphState({
                input: '帮我创建 quiz',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'create_user_calendar_event',
                params: {
                    title: 'COMP3015 Quiz',
                    eventType: 'quiz',
                    eventDate: '2026-05-18',
                },
                missingRequiredFields: [],
                userVisibleSummary: '创建 2026-05-18 的 COMP3015 Quiz 日历事件',
                safeToExecute: true,
            },
        });

        expect(state.confirmation.required).toBe(true);
        expect(state.confirmation.satisfied).toBe(false);
        expect(state.confirmation.prompt).toContain('确认');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/actions.test.ts`

Expected: FAIL because the action nodes do not exist yet.

- [ ] **Step 3: Implement action preparation, confirmation, and tool adapters**

Create `services/agent/graph/tools/calendar_tools.ts`:

```ts
import { createUserCalendarEvent } from '../../calendar';

export const createCalendarEventTool = async (input: {
    title: string;
    eventType: 'exam' | 'quiz' | 'assignment' | 'custom';
    eventDate: string;
    courseCode?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    note?: string;
}) => {
    const result = await createUserCalendarEvent(input as any);
    return {
        toolName: 'create_user_calendar_event',
        success: !result.error,
        resultSummary: result.error ? result.error.message || 'calendar write failed' : 'calendar event created',
        rawResult: result,
        retryable: Boolean(result.error),
    };
};
```

Create `services/agent/graph/tools/schedule_tools.ts`:

```ts
import { createManualScheduleEntry, getUserScheduleEntries } from '../../schedule';

export const readUserScheduleTool = async (userId: string) => {
    const entries = await getUserScheduleEntries(userId, { allowStaleOnError: true });
    return {
        toolName: 'read_user_schedule',
        success: true,
        resultSummary: `loaded ${entries.length} schedule entries`,
        rawResult: entries,
        retryable: false,
    };
};

export const writeUserScheduleTool = async (input: any) => {
    const entry = await createManualScheduleEntry(input);
    return {
        toolName: 'write_user_schedule_entry',
        success: true,
        resultSummary: 'schedule entry created',
        rawResult: entry,
        retryable: false,
    };
};
```

Create `services/agent/graph/tools/course_community_tools.ts`:

```ts
import { addReview } from '../../courses';
import { postTeamingRequest } from '../../teaming';
import { supabase } from '../../supabase';

export const postCourseReviewTool = async (input: any) => {
    const result = await addReview(input);
    return {
        toolName: 'post_course_review',
        success: !result.error,
        resultSummary: result.error ? result.error.message || 'review post failed' : 'review posted',
        rawResult: result,
        retryable: Boolean(result.error),
    };
};

export const postCourseTeamingTool = async (input: any) => {
    const result = await postTeamingRequest(input);
    return {
        toolName: 'post_course_teaming',
        success: result.success,
        resultSummary: result.success ? 'teaming post published' : result.error || 'teaming post failed',
        rawResult: result,
        retryable: !result.success,
    };
};

export const sendCourseChatMessageTool = async (input: {
    courseId: string;
    senderId: string;
    content: string;
}) => {
    const { error } = await supabase.from('messages').insert({
        course_id: input.courseId,
        sender_id: input.senderId,
        content: input.content,
    });

    return {
        toolName: 'send_course_chat_message',
        success: !error,
        resultSummary: error ? error.message || 'chat message failed' : 'chat message sent',
        rawResult: { error },
        retryable: Boolean(error),
    };
};
```

Create `services/agent/graph/nodes/prepare_action.ts`:

```ts
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';

const extractCourseCode = (value: string) => {
    const match = value.toUpperCase().match(/\b([A-Z]{2,6}\s?\d{4}[A-Z]?)\b/);
    return match ? match[1].replace(/\s+/g, '') : undefined;
};

export const prepareActionNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    if (state.plan.proposedActionType === 'create_user_calendar_event') {
        const courseCode = extractCourseCode(state.input);
        const eventDateMatch = state.input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        const pendingAction = {
            type: 'create_user_calendar_event' as const,
            params: {
                title: courseCode ? `${courseCode} Quiz` : 'Quiz',
                eventType: 'quiz' as const,
                eventDate: eventDateMatch?.[1],
                courseCode,
            },
            missingRequiredFields: eventDateMatch ? [] : ['eventDate'],
            userVisibleSummary: eventDateMatch
                ? `创建 ${eventDateMatch[1]} 的 ${courseCode || 'Quiz'} 日历事件`
                : `创建 ${courseCode || 'Quiz'} 日历事件`,
            safeToExecute: Boolean(eventDateMatch),
        };

        return pushTrace(
            {
                ...state,
                pendingAction,
            },
            'prepare_action',
            pendingAction.userVisibleSummary
        );
    }

    return pushTrace(
        {
            ...state,
            clarification: {
                needed: true,
                missingSlots: ['supported_action_type'],
                question: '我暂时还不能安全地准备这个写操作，请先改成课程评论、组队、课表或日历事件。',
                scope: 'action_parameters',
            },
        },
        'prepare_action',
        'unsupported action'
    );
};
```

Create `services/agent/graph/nodes/confirm_action.ts`:

```ts
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';

const hasConfirmPhrase = (value: string) => /确认|可以|是的|yes|ok|okay|confirm/i.test(value);

export const confirmActionNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const required = Boolean(state.pendingAction);
    const satisfied = required && hasConfirmPhrase(state.input);
    const prompt = state.pendingAction
        ? `请确认是否执行：${state.pendingAction.userVisibleSummary}`
        : undefined;

    return pushTrace(
        {
            ...state,
            confirmation: {
                required,
                satisfied,
                prompt: satisfied ? undefined : prompt,
            },
        },
        'confirm_action',
        satisfied ? 'confirmed' : 'awaiting confirmation'
    );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/tools/calendar_tools.ts services/agent/graph/tools/schedule_tools.ts services/agent/graph/tools/course_community_tools.ts services/agent/graph/nodes/prepare_action.ts services/agent/graph/nodes/confirm_action.ts __tests__/services/agent/graph/actions.test.ts
git commit -m "feat: add langgraph action preparation and confirmation"
```

## Task 8: Implement Tool Execution, Memory Node, and Graph Runtime Assembly

**Files:**
- Create: `services/agent/graph/tools/memory_tools.ts`
- Create: `services/agent/graph/tools/faq_tools.ts`
- Create: `services/agent/graph/tools/campus_lookup_tools.ts`
- Create: `services/agent/graph/nodes/execute_tools.ts`
- Create: `services/agent/graph/nodes/write_memory.ts`
- Create: `services/agent/graph/index.ts`
- Modify: `__tests__/services/agent/graph/runtime.test.ts`

- [ ] **Step 1: Add the failing execution tests**

Append to `__tests__/services/agent/graph/runtime.test.ts`:

```ts
import { createAgentGraphRuntime } from '../../../../services/agent/graph';

jest.mock('../../../../services/agent/graph/tools/calendar_tools', () => ({
    createCalendarEventTool: jest.fn().mockResolvedValue({
        toolName: 'create_user_calendar_event',
        success: true,
        resultSummary: 'calendar event created',
        rawResult: { id: 'event-1' },
        retryable: false,
    }),
}));

jest.mock('../../../../services/agent/memory_extractor', () => ({
    extractMemoryCandidatesFromConversation: jest.fn().mockResolvedValue([]),
    filterMemoryCandidates: jest.fn().mockReturnValue([]),
}));

describe('graph runtime', () => {
    it('returns a final AgentResponse for a faq request', async () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: FAIL because the runtime assembly and execution nodes do not exist yet.

- [ ] **Step 3: Implement execution, memory node, and runtime assembly**

Create `services/agent/graph/tools/memory_tools.ts`:

```ts
import { getAllUserFacts, saveMemoryFact } from '../../memory';

export const readMemoryFactsTool = (userId: string) => getAllUserFacts(userId);
export const writeMemoryFactTool = (userId: string, key: string, value: string) =>
    saveMemoryFact(userId, key, value);
```

Create `services/agent/graph/tools/faq_tools.ts`:

```ts
import { FAQService } from '../../faq';

export const searchCampusFaqTool = async (query: string) => {
    const local = FAQService.searchFAQs(query);
    const kb = await FAQService.searchKnowledgeBase(query);
    return {
        toolName: 'search_campus_faq',
        success: true,
        resultSummary: `faq=${local.length}, kb=${kb.length}`,
        rawResult: { local, kb },
        retryable: false,
    };
};
```

Create `services/agent/graph/tools/campus_lookup_tools.ts`:

```ts
import { formatBuildingInfo, formatNearbyPlaceInfo } from '../../campus_queries';

export const readCampusBuildingTool = async (query: string) => {
    const result = await formatBuildingInfo(query);
    return {
        toolName: 'read_campus_building',
        success: true,
        resultSummary: 'building info loaded',
        rawResult: result,
        retryable: false,
    };
};

export const findNearbyPlaceTool = async (query: string, deviceLocation?: { latitude: number; longitude: number } | null) => {
    const result = await formatNearbyPlaceInfo(query, deviceLocation);
    return {
        toolName: 'find_nearby_place',
        success: true,
        resultSummary: 'nearby place lookup finished',
        rawResult: result,
        retryable: false,
    };
};
```

Create `services/agent/graph/nodes/execute_tools.ts`:

```ts
import { createCalendarEventTool } from '../tools/calendar_tools';
import type { AgentGraphState, PreparedToolCall } from '../types';
import { pushTrace } from '../telemetry';

const buildToolCalls = (state: AgentGraphState): PreparedToolCall[] => {
    if (!state.pendingAction) return [];

    return [
        {
            toolName: state.pendingAction.type,
            input: state.pendingAction.params,
        },
    ];
};

export const executeToolsNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    const toolCalls = buildToolCalls(state);
    const results = [];

    for (const call of toolCalls) {
        if (call.toolName === 'create_user_calendar_event') {
            results.push(await createCalendarEventTool(call.input as any));
        }
    }

    return pushTrace(
        {
            ...state,
            toolCalls,
            toolResults: results,
        },
        'execute_tools',
        `executed=${results.length}`
    );
};
```

Create `services/agent/graph/nodes/write_memory.ts`:

```ts
import { getAllUserFacts } from '../../memory';
import {
    extractMemoryCandidatesFromConversation,
    filterMemoryCandidates,
} from '../../memory_extractor';
import { writeMemoryFactTool } from '../tools/memory_tools';
import type { AgentGraphState } from '../types';
import { pushTrace } from '../telemetry';

export const writeMemoryNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    try {
        const existingFacts = await getAllUserFacts(state.userId);
        const candidates = await extractMemoryCandidatesFromConversation({
            recentTurns: state.history.slice(-3),
        });
        const accepted = filterMemoryCandidates(candidates, existingFacts);

        for (const memory of accepted) {
            await writeMemoryFactTool(state.userId, memory.key, memory.value);
        }

        return pushTrace(
            {
                ...state,
                memoryCandidates: candidates,
            },
            'write_memory',
            `accepted=${accepted.length}`
        );
    } catch (error) {
        return pushTrace(
            {
                ...state,
                errors: [...state.errors, `write_memory:${String(error)}`],
            },
            'write_memory',
            'skipped after error'
        );
    }
};
```

Create `services/agent/graph/index.ts`:

```ts
import type { AgentResponse } from '../types';
import type { GraphEntryInput, GraphRuntime } from './types';
import { createInitialAgentGraphState } from './state';
import { normalizeInputNode } from './nodes/normalize_input';
import { routeIntentNode } from './nodes/route_intent';
import { retrieveContextNode } from './nodes/retrieve_context';
import { planNextStepNode } from './nodes/plan_next_step';
import { clarifyUserNode } from './nodes/clarify_user';
import { prepareActionNode } from './nodes/prepare_action';
import { confirmActionNode } from './nodes/confirm_action';
import { executeToolsNode } from './nodes/execute_tools';
import { synthesizeResponseNode } from './nodes/synthesize_response';
import { writeMemoryNode } from './nodes/write_memory';
import {
    getConfirmationBranch,
    getIntentBranch,
    getPlannerBranch,
    getPostPrepareBranch,
} from './edges';

const toAgentResponse = (finalState: any): AgentResponse => ({
    finalAnswer: finalState.finalResponse,
    steps: finalState.trace.map((entry: any) => ({
        thought: `${entry.node}: ${entry.summary}`,
        path: 'llm',
    })),
});

export const createAgentGraphRuntime = (): GraphRuntime => ({
    async run(input: GraphEntryInput) {
        let state = createInitialAgentGraphState(input);
        state = await normalizeInputNode(state);
        state = await routeIntentNode(state);

        const firstBranch = getIntentBranch(state.intent);
        if (firstBranch === 'retrieve_context') {
            state = await retrieveContextNode(state);
        }

        state = await planNextStepNode(state);
        const plannerBranch = getPlannerBranch(state.plan);

        if (plannerBranch === 'clarify_user') {
            state = await clarifyUserNode(state);
            state = await synthesizeResponseNode(state);
            state = await writeMemoryNode(state);
            return toAgentResponse(state);
        }

        if (plannerBranch === 'prepare_action') {
            state = await prepareActionNode(state);
            const postPrepareBranch = getPostPrepareBranch(state.pendingAction);

            if (postPrepareBranch === 'clarify_user') {
                state = await clarifyUserNode(state);
                state = await synthesizeResponseNode(state);
                state = await writeMemoryNode(state);
                return toAgentResponse(state);
            }

            state = await confirmActionNode(state);
            const confirmationBranch = getConfirmationBranch(state.confirmation);

            if (confirmationBranch === 'execute_tools') {
                state = await executeToolsNode(state);
            }
        }

        state = await synthesizeResponseNode(state);
        state = await writeMemoryNode(state);
        return toAgentResponse(state);
    },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/graph/tools/memory_tools.ts services/agent/graph/tools/faq_tools.ts services/agent/graph/tools/campus_lookup_tools.ts services/agent/graph/nodes/execute_tools.ts services/agent/graph/nodes/write_memory.ts services/agent/graph/index.ts __tests__/services/agent/graph/runtime.test.ts
git commit -m "feat: assemble langgraph agent runtime"
```

## Task 9: Wire the Chat Screen and Compatibility Entry Path

**Files:**
- Modify: `components/agent/AgentChatScreen.tsx`
- Modify: `services/agent/executor.ts`
- Modify: `__tests__/services/agent/executor.test.ts`

- [ ] **Step 1: Write the failing integration expectation**

Add this test case near the top of `__tests__/services/agent/executor.test.ts`:

```ts
jest.mock('../../../services/agent', () => ({
    runAgentGraph: jest.fn().mockResolvedValue({
        finalAnswer: 'graph answer',
        steps: [{ thought: 'graph runtime used', path: 'llm' }],
    }),
}));

it('delegates process to the new graph runtime entrypoint', async () => {
    const { runAgentGraph } = require('../../../services/agent');
    const executor = new AgentExecutor('user-1');

    const response = await executor.process('GPA 怎么算？');

    expect(runAgentGraph).toHaveBeenCalled();
    expect(response.finalAnswer).toBe('graph answer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/services/agent/executor.test.ts`

Expected: FAIL because `AgentExecutor` still owns orchestration directly.

- [ ] **Step 3: Replace direct executor orchestration with delegation**

Update `services/agent/executor.ts` to keep session context methods but delegate `process(...)`:

```ts
import { runAgentGraph } from '.';
```

Replace the body of `process` with:

```ts
async process(input: string, onUpdate?: (text: string) => void) {
    this.context.history.push({ role: 'user', content: input });

    const response = await runAgentGraph({
        input,
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        history: this.context.history,
        historySummary: this.context.historySummary,
        sessionState: this.context.sessionState,
        deviceLocation: this.context.deviceLocation,
    });

    if (response.finalAnswer) {
        this.context.history.push({ role: 'assistant', content: response.finalAnswer });
        if (onUpdate) onUpdate(response.finalAnswer);
    }

    return response;
}
```

Update `components/agent/AgentChatScreen.tsx` only enough to keep the same import surface if needed. If `AgentExecutor` remains as a wrapper, do not modify UI behavior yet. If switching to the public entrypoint directly, replace:

```ts
import { AgentExecutor } from '../../services/agent/executor';
```

with:

```ts
import { AgentExecutor } from '../../services/agent/executor';
```

and leave the UI unchanged in this task. This task is about runtime delegation, not UI redesign.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand __tests__/services/agent/executor.test.ts`

Expected: PASS for the delegation test and any retained compatibility cases.

- [ ] **Step 5: Commit**

```bash
git add services/agent/executor.ts __tests__/services/agent/executor.test.ts
git commit -m "refactor: delegate agent executor to graph runtime"
```

## Task 10: Final Verification and Cleanup Pass

**Files:**
- Test: `__tests__/services/agent/graph/state.test.ts`
- Test: `__tests__/services/agent/graph/edges.test.ts`
- Test: `__tests__/services/agent/graph/retrieval.test.ts`
- Test: `__tests__/services/agent/graph/planner.test.ts`
- Test: `__tests__/services/agent/graph/actions.test.ts`
- Test: `__tests__/services/agent/graph/runtime.test.ts`
- Test: `__tests__/services/agent/executor.test.ts`

- [ ] **Step 1: Run focused graph test suite**

Run: `npm test -- --runInBand __tests__/services/agent/graph/state.test.ts __tests__/services/agent/graph/edges.test.ts __tests__/services/agent/graph/retrieval.test.ts __tests__/services/agent/graph/planner.test.ts __tests__/services/agent/graph/actions.test.ts __tests__/services/agent/graph/runtime.test.ts`

Expected: PASS

- [ ] **Step 2: Run executor compatibility regression**

Run: `npm test -- --runInBand __tests__/services/agent/executor.test.ts`

Expected: PASS

- [ ] **Step 3: Run adjacent agent tests**

Run: `npm test -- --runInBand __tests__/services/agent/llm.test.ts __tests__/services/agent/memory_extractor.test.ts __tests__/services/agent/config.test.ts`

Expected: PASS

- [ ] **Step 4: Run full suite**

Run: `npm test -- --runInBand`

Expected: PASS

- [ ] **Step 5: Review working tree and commit touch-ups**

Run: `git status --short`

Expected: only intended LangGraph implementation files are modified.

If any final cleanup is needed:

```bash
git add services/agent/index.ts services/agent/graph components/agent/AgentChatScreen.tsx services/agent/executor.ts services/agent/types.ts __tests__/services/agent
git commit -m "chore: finalize langgraph agent migration"
```

## Self-Review

### Spec coverage

- Primary graph runtime: covered in Tasks 1, 2, and 8.
- Structured state and edges: covered in Tasks 1 and 2.
- Retrieval as evidence pipeline: covered in Task 3 and Task 5.
- Planner restricted to `answer / clarify / act`: covered in Task 5.
- Clarification flow: covered in Task 6.
- Action preparation, confirmation, and execution safety: covered in Task 7 and Task 8.
- Memory write as terminal non-blocking concern: covered in Task 8.
- Stable app-facing integration: covered in Task 9.
- Test matrix and regression safety: covered in Task 10.

### Placeholder scan

- No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Every task includes exact file paths, commands, and concrete code scaffolds.

### Type consistency

- `AgentGraphState` is introduced once in `services/agent/graph/types.ts`.
- `PlannerDecision` is consistently `answer | clarify | act`.
- `PendingAction` names match the design spec and tool adapters.
- `AgentResponse` remains the app-facing response contract.

## Implementation Notes

- If `LangGraph` API details differ slightly from the scaffold above, keep the architecture and file boundaries the same while adapting the exact runtime assembly code.
- Do not delete the legacy executor logic until graph-path and executor compatibility tests pass.
- Keep the first delivery conservative: one primary graph, no subgraphs, no persistent graph checkpointing.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-hkcampus-agent-langgraph-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

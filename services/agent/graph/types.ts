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

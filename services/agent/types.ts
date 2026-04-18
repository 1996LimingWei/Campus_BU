export type ToolParameter = {
    type: 'string' | 'number' | 'boolean' | 'object';
    description: string;
    required?: boolean;
};

export type ToolDefinition = {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required: string[];
    };
};

export type AgentStep = {
    thought?: string;
    reply?: string;
    modelTier?: 'fast' | 'reasoning';
    modelName?: string;
    routeReason?: string;
    path?: 'pending' | 'stable_task' | 'local_rule' | 'intent_route' | 'cache' | 'llm';
    action?: {
        tool: string;
        input: any;
    };
    observation?: string;
    quickReplies?: string[];
};

export type AgentResponse = {
    steps: AgentStep[];
    finalAnswer?: string;
    quickReplies?: string[];
};

export type AgentHistoryItem = {
    role: 'user' | 'assistant' | 'tool';
    content: string;
};

export type AgentSessionState = {
    goal?: string;
    activeTask?: string;
    facts: Record<string, string>;
    recentDecisions: string[];
    openLoops: string[];
    referencedCourse?: string;
    referencedBuilding?: string;
    summary?: string;
};

export type MemoryCandidateType =
    | 'long_term_preference'
    | 'background_fact'
    | 'emotion'
    | 'temporary_context'
    | 'unknown';

export type MemoryCandidateBase = {
    should_store: boolean;
    key: string;
    value: string;
    confidence: number;
    reason: string;
};

export type MemoryCandidate = MemoryCandidateBase & {
    memory_type: MemoryCandidateType;
};

export type DurableMemoryType = Exclude<
    MemoryCandidateType,
    'emotion' | 'temporary_context' | 'unknown'
>;

export type AcceptedMemoryWrite = {
    memoryType: DurableMemoryType;
} & MemoryCandidateBase;

export interface AgentGeoPoint {
    latitude: number;
    longitude: number;
}

export interface AgentContext {
    userId: string;
    sessionId: string;
    history: AgentHistoryItem[];
    historySummary?: string;
    sessionState: AgentSessionState;
    deviceLocation?: AgentGeoPoint | null;
}

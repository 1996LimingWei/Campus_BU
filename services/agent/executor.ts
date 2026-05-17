import { createInitialSessionState, updateSessionStateWithTurn } from './session_state';
import { summarizeHistory } from './summarizer';
import { runAgentGraph } from '.';
import { AgentContext, AgentGeoPoint, AgentResponse } from './types';

/**
 * Thin adapter that owns entrypoint wiring and conversation context assembly.
 * All agent behavior (intent routing, tool execution, confirmation flow, memory)
 * lives in the LangGraph runtime.
 */
export class AgentExecutor {
    private context: AgentContext;
    private static readonly MAX_HISTORY_ITEMS = 12;
    private static readonly MAX_RECENT_HISTORY_ITEMS = 6;

    constructor(userId: string) {
        this.context = {
            userId,
            sessionId: `session_${Date.now()}`,
            history: [],
            historySummary: '',
            sessionState: createInitialSessionState(),
            deviceLocation: null,
        };
    }

    setDeviceLocation(location: AgentGeoPoint | null) {
        this.context.deviceLocation = location;
    }

    async process(prompt: string, onUpdate?: (text: string) => void): Promise<AgentResponse> {
        return this.processWithGraph(prompt, onUpdate);
    }

    async processWithGraph(prompt: string, onUpdate?: (text: string) => void): Promise<AgentResponse> {
        this.pushHistory('user', prompt);

        const result = await runAgentGraph({
            input: prompt,
            userId: this.context.userId,
            sessionId: this.context.sessionId,
            history: this.context.history,
            historySummary: this.context.historySummary,
            sessionState: this.context.sessionState,
            deviceLocation: this.context.deviceLocation,
        });

        this.context.sessionState = result.sessionState;

        if (result.response.finalAnswer) {
            this.pushHistory('assistant', result.response.finalAnswer);
            if (onUpdate) onUpdate(result.response.finalAnswer);
        }

        return result.response;
    }

    private pushHistory(role: 'user' | 'assistant' | 'tool', content: string) {
        const item = { role, content } as const;
        this.context.history.push(item);
        this.context.sessionState = updateSessionStateWithTurn(this.context.sessionState, item);
        if (this.context.history.length > AgentExecutor.MAX_HISTORY_ITEMS) {
            const summarized = summarizeHistory(this.context.history, {
                keepRecent: AgentExecutor.MAX_RECENT_HISTORY_ITEMS,
            });
            this.context.historySummary = [this.context.historySummary, summarized.summary].filter(Boolean).join('\n');
            this.context.sessionState.summary = this.context.historySummary;
            this.context.history = summarized.recentHistory;
        }
    }
}

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

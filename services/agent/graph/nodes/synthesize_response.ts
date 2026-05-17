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

    if (state.confirmation.required && !state.confirmation.satisfied && state.confirmation.prompt) {
        return pushTrace(
            {
                ...state,
                finalResponse: state.confirmation.prompt,
            },
            'synthesize_response',
            'confirmation prompt'
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

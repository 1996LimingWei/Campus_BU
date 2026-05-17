import { callDeepSeek, resolveModelName } from '../../llm';
import type { AgentGraphState } from '../types';
import { pushTrace, pushTraceWithDuration, startTraceTimer } from '../telemetry';
import { buildSynthesizerPrompt } from '../prompts/synthesizer';

export const synthesizeResponseNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    if (state.clarification.needed && state.clarification.question) {
        return pushTrace(
            {
                ...state,
                finalResponse: state.clarification.question,
            },
            'synthesize_response',
            'clarification response',
            { checkpoint: 'clarification' }
        );
    }

    if (state.confirmation.cancelled) {
        return pushTrace(
            {
                ...state,
                finalResponse: '已取消这次操作。你如果想改内容，直接重新告诉我，我会先给你确认稿。',
            },
            'synthesize_response',
            'cancellation response',
            { checkpoint: 'cancelled' }
        );
    }

    if (state.confirmation.required && !state.confirmation.satisfied && state.confirmation.prompt) {
        return pushTrace(
            {
                ...state,
                finalResponse: state.confirmation.prompt,
            },
            'synthesize_response',
            'confirmation prompt',
            { checkpoint: 'confirmation' }
        );
    }

    const model = resolveModelName('fast');
    const timer = startTraceTimer();
    const raw = await callDeepSeek(buildSynthesizerPrompt(state), { model });
    const latencyMs = timer.getDuration();

    return pushTraceWithDuration(
        {
            ...state,
            finalResponse: raw,
        },
        'synthesize_response',
        'llm synthesis',
        timer.startedAt,
        {
            checkpoint: 'completed',
            llmCalls: [{ model, success: true, latencyMs }],
        }
    );
};

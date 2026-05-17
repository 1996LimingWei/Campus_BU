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

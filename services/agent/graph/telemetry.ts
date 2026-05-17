import type { AgentGraphState } from './types';

export const pushTrace = (
    state: AgentGraphState,
    node: string,
    summary: string
): AgentGraphState => ({
    ...state,
    trace: [...state.trace, { node, summary }],
});

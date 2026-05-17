import type { GraphEntryInput } from './graph/types';
import { createAgentGraphRuntime } from './graph';

export const runAgentGraph = async (input: GraphEntryInput) => {
    const runtime = createAgentGraphRuntime();
    return runtime.run(input);
};

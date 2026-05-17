import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { AgentResponse } from '../types';
import type { AgentGraphState, GraphEntryInput, GraphRunResult, GraphRuntime } from './types';
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

const toAgentResponse = (finalState: AgentGraphState): AgentResponse => ({
    finalAnswer: finalState.finalResponse,
    steps: finalState.trace.map((entry) => ({
        thought: `${entry.node}: ${entry.summary}`,
        path: 'llm' as const,
        ...(entry.llmCalls?.length ? { modelName: entry.llmCalls[0].model } : {}),
    })),
    debug: {
        trace: finalState.trace,
    },
});

const AgentGraphAnnotation = Annotation.Root({
    state: Annotation<AgentGraphState>(),
});

type AgentGraphWrapperState = typeof AgentGraphAnnotation.State;

const wrapNode = (
    node: (state: AgentGraphState) => Promise<AgentGraphState>
) => async (wrapper: AgentGraphWrapperState) => ({
    state: await node(wrapper.state),
});

export const createCompiledAgentGraph = () => new StateGraph(AgentGraphAnnotation)
    .addNode('normalize_input', wrapNode(normalizeInputNode))
    .addNode('route_intent', wrapNode(routeIntentNode))
    .addNode('retrieve_context', wrapNode(retrieveContextNode))
    .addNode('plan_next_step', wrapNode(planNextStepNode))
    .addNode('clarify_user', wrapNode(clarifyUserNode))
    .addNode('prepare_action', wrapNode(prepareActionNode))
    .addNode('confirm_action', wrapNode(confirmActionNode))
    .addNode('execute_tools', wrapNode(executeToolsNode))
    .addNode('synthesize_response', wrapNode(synthesizeResponseNode))
    .addNode('write_memory', wrapNode(writeMemoryNode))
    .addEdge(START, 'normalize_input')
    .addEdge('normalize_input', 'route_intent')
    .addConditionalEdges('route_intent', (wrapper: AgentGraphWrapperState) => (
        getIntentBranch(wrapper.state.intent)
    ))
    .addEdge('retrieve_context', 'plan_next_step')
    .addConditionalEdges('plan_next_step', (wrapper: AgentGraphWrapperState) => (
        getPlannerBranch(wrapper.state.plan)
    ))
    .addConditionalEdges('prepare_action', (wrapper: AgentGraphWrapperState) => (
        getPostPrepareBranch(wrapper.state.pendingAction)
    ))
    .addConditionalEdges('confirm_action', (wrapper: AgentGraphWrapperState) => (
        getConfirmationBranch(wrapper.state.confirmation)
    ))
    .addEdge('execute_tools', 'synthesize_response')
    .addEdge('synthesize_response', 'write_memory')
    .addEdge('write_memory', END)
    .compile();

export const createAgentGraphRuntime = (): GraphRuntime => ({
    async run(input: GraphEntryInput): Promise<GraphRunResult> {
        const graph = createCompiledAgentGraph();
        const result = await graph.invoke({
            state: createInitialAgentGraphState(input),
        });

        const finalState: AgentGraphState = result.state;
        const response = toAgentResponse(finalState);
        const sessionState = {
            ...finalState.sessionState,
            pendingAction: finalState.pendingAction,
        };

        return { response, sessionState, finalState };
    },
});

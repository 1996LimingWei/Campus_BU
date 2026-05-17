import {
    getIntentBranch,
    getPlannerBranch,
    getPostPrepareBranch,
    getConfirmationBranch,
} from '../../../../services/agent/graph/edges';

describe('graph edge helpers', () => {
    it('routes unsupported intent directly to synthesis', () => {
        expect(getIntentBranch({
            kind: 'unsupported',
            requiresRetrieval: false,
        } as any)).toBe('synthesize_response');
    });

    it('routes retrieval intents into retrieve_context', () => {
        expect(getIntentBranch({
            kind: 'qa',
            requiresRetrieval: true,
        } as any)).toBe('retrieve_context');
    });

    it('routes planner act decision into prepare_action', () => {
        expect(getPlannerBranch({ decision: 'act' } as any)).toBe('prepare_action');
    });

    it('routes incomplete actions into clarify_user', () => {
        expect(getPostPrepareBranch({
            missingRequiredFields: ['eventDate'],
        } as any)).toBe('clarify_user');
    });

    it('routes unsatisfied confirmation back to synthesis', () => {
        expect(getConfirmationBranch({
            required: true,
            satisfied: false,
        })).toBe('synthesize_response');
    });
});

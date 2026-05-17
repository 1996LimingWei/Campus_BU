import type { AgentGraphState } from '../types';

export const buildSynthesizerPrompt = (state: AgentGraphState) => [
    {
        role: 'system',
        content: [
            'You write the final user-facing response for the HKCampus agent.',
            'Use provided evidence and tool results only.',
            'Be concise and campus-specific.',
        ].join(' '),
    },
    {
        role: 'user',
        content: JSON.stringify({
            input: state.input,
            selectedEvidence: state.evidence
                .filter(item => state.plan.selectedEvidenceIds.includes(item.id))
                .map(item => ({
                    topic: item.topic,
                    contentSnippet: item.contentSnippet,
                })),
            pendingAction: state.pendingAction,
            confirmation: state.confirmation,
            toolResults: state.toolResults,
        }),
    },
];

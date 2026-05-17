import type { AgentSessionState, PendingAction } from '../../../../services/agent/types';
import { createInitialSessionState, updateSessionStateWithTurn, formatSessionState } from '../../../../services/agent/session_state';
import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';

const sampleScheduleAction: PendingAction = {
    type: 'write_user_schedule_entry',
    params: {
        title: 'COMP3015',
        courseCode: 'COMP3015',
        dayOfWeek: 2,
        startTime: '09:00',
        endTime: '10:00',
    },
    missingRequiredFields: [],
    userVisibleSummary: 'Write COMP3015 to schedule on Tuesday 09:00-10:00',
    safeToExecute: true,
};

const sampleReviewAction: PendingAction = {
    type: 'post_course_review',
    params: { courseCode: 'COMP3015', rating: 5, content: 'Great course' },
    missingRequiredFields: [],
    userVisibleSummary: 'Post 5 star review to COMP3015',
    safeToExecute: true,
};

describe('PendingAction in AgentSessionState', () => {
    it('accepts a PendingAction in session state', () => {
        const state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleScheduleAction,
        };

        expect(state.pendingAction).toBeDefined();
        expect(state.pendingAction?.type).toBe('write_user_schedule_entry');
    });

    it('accepts null pendingAction in session state', () => {
        const state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: null,
        };

        expect(state.pendingAction).toBeNull();
    });

    it('defaults pendingAction to null in initial session state', () => {
        const state: AgentSessionState = createInitialSessionState();

        expect(state.pendingAction).toBeNull();
    });
});

describe('PendingAction round-trips through graph state initializer', () => {
    it('carries pendingAction from sessionState into graph state', () => {
        const sessionState: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleScheduleAction,
        };

        const graphState = createInitialAgentGraphState({
            input: 'confirm',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState,
        });

        expect(graphState.pendingAction).toBeDefined();
        expect(graphState.pendingAction?.type).toBe('write_user_schedule_entry');
        expect(graphState.pendingAction?.params.courseCode).toBe('COMP3015');
    });

    it('defaults graph pendingAction to null when sessionState has no pendingAction', () => {
        const sessionState = createInitialSessionState();

        const graphState = createInitialAgentGraphState({
            input: 'hello',
            userId: 'user-1',
            sessionId: 'session-1',
            history: [],
            sessionState,
        });

        expect(graphState.pendingAction).toBeNull();
    });
});

describe('Session state preserves pendingAction across turns', () => {
    it('keeps pendingAction after a user turn', () => {
        const state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleScheduleAction,
        };

        const afterUser = updateSessionStateWithTurn(state, {
            role: 'user',
            content: '确认',
        });

        expect(afterUser.pendingAction).toBeDefined();
        expect(afterUser.pendingAction?.type).toBe('write_user_schedule_entry');
    });

    it('keeps pendingAction after an assistant turn', () => {
        const state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleReviewAction,
        };

        const afterAssistant = updateSessionStateWithTurn(state, {
            role: 'assistant',
            content: '我准备发布到 COMP3015 的评价是：5 星',
        });

        expect(afterAssistant.pendingAction).toBeDefined();
        expect(afterAssistant.pendingAction?.type).toBe('post_course_review');
    });

    it('keeps pendingAction through multiple turns', () => {
        let state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleScheduleAction,
        };

        state = updateSessionStateWithTurn(state, { role: 'user', content: '确认一下' });
        state = updateSessionStateWithTurn(state, { role: 'assistant', content: '好的，正在处理' });
        state = updateSessionStateWithTurn(state, { role: 'user', content: '谢谢' });

        expect(state.pendingAction).toBeDefined();
        expect(state.pendingAction?.type).toBe('write_user_schedule_entry');
    });
});

describe('formatSessionState includes pendingAction', () => {
    it('renders pendingAction summary when present', () => {
        const state: AgentSessionState = {
            ...createInitialSessionState(),
            pendingAction: sampleScheduleAction,
        };

        const formatted = formatSessionState(state);
        expect(formatted).toContain('pendingAction');
        expect(formatted).toContain('write_user_schedule_entry');
    });

    it('does not render pendingAction when absent', () => {
        const state = createInitialSessionState();
        const formatted = formatSessionState(state);
        expect(formatted).not.toContain('pendingAction');
    });
});

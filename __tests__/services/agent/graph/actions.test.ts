import { createInitialAgentGraphState } from '../../../../services/agent/graph/state';
import { prepareActionNode } from '../../../../services/agent/graph/nodes/prepare_action';
import { confirmActionNode } from '../../../../services/agent/graph/nodes/confirm_action';
import { executeToolsNode } from '../../../../services/agent/graph/nodes/execute_tools';

const mockWriteUserScheduleTool = jest.fn();
const mockCreateCalendarEventTool = jest.fn();
const mockPostCourseReviewTool = jest.fn();
const mockPostCourseTeamingTool = jest.fn();
const mockSendCourseChatMessageTool = jest.fn();

jest.mock('../../../../services/agent/graph/tools/schedule_tools', () => ({
    writeUserScheduleTool: (...args: any[]) => mockWriteUserScheduleTool(...args),
}));

jest.mock('../../../../services/agent/graph/tools/calendar_tools', () => ({
    createCalendarEventTool: (...args: any[]) => mockCreateCalendarEventTool(...args),
}));

jest.mock('../../../../services/agent/graph/tools/course_community_tools', () => ({
    postCourseReviewTool: (...args: any[]) => mockPostCourseReviewTool(...args),
    postCourseTeamingTool: (...args: any[]) => mockPostCourseTeamingTool(...args),
    sendCourseChatMessageTool: (...args: any[]) => mockSendCourseChatMessageTool(...args),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockWriteUserScheduleTool.mockResolvedValue({
        toolName: 'write_user_schedule_entry',
        success: true,
        resultSummary: 'schedule entry created',
        rawResult: { id: 'schedule-1' },
        retryable: false,
    });
    mockCreateCalendarEventTool.mockResolvedValue({
        toolName: 'create_user_calendar_event',
        success: true,
        resultSummary: 'calendar event created',
        rawResult: { id: 'event-1' },
        retryable: false,
    });
    mockPostCourseReviewTool.mockResolvedValue({
        toolName: 'post_course_review',
        success: true,
        resultSummary: 'review posted',
        rawResult: { id: 'review-1' },
        retryable: false,
    });
    mockPostCourseTeamingTool.mockResolvedValue({
        toolName: 'post_course_teaming',
        success: true,
        resultSummary: 'teaming post published',
        rawResult: { id: 'team-1' },
        retryable: false,
    });
    mockSendCourseChatMessageTool.mockResolvedValue({
        toolName: 'send_course_chat_message',
        success: true,
        resultSummary: 'chat message sent',
        rawResult: { id: 'message-1' },
        retryable: false,
    });
});

describe('prepareActionNode', () => {
    it('extracts a calendar event action and marks missing date as clarification-needed', async () => {
        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '帮我把 COMP3015 的 quiz 记到日历里',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'user asked to create an event',
                selectedEvidenceIds: [],
                proposedActionType: 'create_user_calendar_event',
            },
        });

        expect(result.pendingAction?.type).toBe('create_user_calendar_event');
        expect(result.pendingAction?.missingRequiredFields).toContain('eventDate');
    });

    it('extracts a schedule write action from planner-proposed schedule writes', async () => {
        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: 'Add COMP3015 Tuesday 09:00-10:00 to my schedule',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'user asked to write schedule',
                selectedEvidenceIds: [],
                proposedActionType: 'write_user_schedule_entry',
            },
        });

        expect(result.pendingAction?.type).toBe('write_user_schedule_entry');
        expect(result.pendingAction?.missingRequiredFields).toEqual([]);
        expect(result.pendingAction?.params).toEqual(expect.objectContaining({
            title: 'COMP3015',
            courseCode: 'COMP3015',
            dayOfWeek: 2,
            startTime: '09:00',
            endTime: '10:00',
        }));
    });

    it('extracts a course review action from planner-proposed review writes', async () => {
        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: 'Post COMP3015 review 5 stars: Clear lectures',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'user asked to post a review',
                selectedEvidenceIds: [],
                proposedActionType: 'post_course_review',
            },
        });

        expect(result.pendingAction?.type).toBe('post_course_review');
        expect(result.pendingAction?.missingRequiredFields).toEqual([]);
        expect(result.pendingAction?.params).toEqual(expect.objectContaining({
            courseCode: 'COMP3015',
            rating: 5,
            content: 'Clear lectures',
        }));
    });

    it('merges schedule time into existing pending action on follow-up', async () => {
        const existingAction = {
            type: 'write_user_schedule_entry' as const,
            params: { title: 'COMP3015', courseCode: 'COMP3015' },
            missingRequiredFields: ['dayOfWeek', 'timeRange'],
            userVisibleSummary: 'Write COMP3015 to schedule',
            safeToExecute: false,
        };

        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '周三 13:00-15:00',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'slot filling',
                selectedEvidenceIds: [],
                proposedActionType: 'write_user_schedule_entry',
            },
            pendingAction: existingAction,
        });

        expect(result.pendingAction?.type).toBe('write_user_schedule_entry');
        const params = (result.pendingAction?.params ?? {}) as any;
        expect(params.dayOfWeek).toBe(3);
        expect(params.startTime).toBe('13:00');
        expect(params.endTime).toBe('15:00');
        expect(params.courseCode).toBe('COMP3015');
    });

    it('merges calendar event date into existing pending action on follow-up', async () => {
        const existingAction = {
            type: 'create_user_calendar_event' as const,
            params: { title: 'COMP3015 Quiz', eventType: 'quiz' as const, courseCode: 'COMP3015' },
            missingRequiredFields: ['eventDate'],
            userVisibleSummary: '创建 COMP3015 Quiz 日历事件',
            safeToExecute: false,
        };

        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '2026-05-18',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'slot filling',
                selectedEvidenceIds: [],
                proposedActionType: 'create_user_calendar_event',
            },
            pendingAction: existingAction,
        });

        expect(result.pendingAction?.type).toBe('create_user_calendar_event');
        const params = (result.pendingAction?.params ?? {}) as any;
        expect(params.eventDate).toBe('2026-05-18');
        expect(params.courseCode).toBe('COMP3015');
        expect(result.pendingAction?.missingRequiredFields).toEqual([]);
    });

    it('merges review rating into existing pending action on follow-up', async () => {
        const existingAction = {
            type: 'post_course_review' as const,
            params: { courseCode: 'COMP3015', content: 'Great course' },
            missingRequiredFields: ['rating'],
            userVisibleSummary: 'Post review to COMP3015',
            safeToExecute: false,
        };

        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '4星',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'slot filling',
                selectedEvidenceIds: [],
                proposedActionType: 'post_course_review',
            },
            pendingAction: existingAction,
        });

        expect(result.pendingAction?.type).toBe('post_course_review');
        const params = (result.pendingAction?.params ?? {}) as any;
        expect(params.rating).toBe(4);
        expect(params.content).toBe('Great course');
        expect(params.courseCode).toBe('COMP3015');
    });

    it('does not treat unrelated short questions as slot-filling follow-up', async () => {
        const existingAction = {
            type: 'write_user_schedule_entry' as const,
            params: { title: 'COMP3015', courseCode: 'COMP3015' },
            missingRequiredFields: ['dayOfWeek', 'timeRange'],
            userVisibleSummary: 'Write COMP3015 to schedule',
            safeToExecute: false,
        };

        const result = await prepareActionNode({
            ...createInitialAgentGraphState({
                input: '这门课什么时候考试',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            plan: {
                decision: 'act',
                reason: 'pending action exists',
                selectedEvidenceIds: [],
                proposedActionType: 'write_user_schedule_entry',
            },
            pendingAction: existingAction,
        });

        expect(result.pendingAction).toEqual(existingAction);
        expect(result.trace[result.trace.length - 1]?.summary).toBe('preserved existing pending action');
    });
});

describe('confirmActionNode', () => {
    it('requires confirmation before write execution', async () => {
        const state = await confirmActionNode({
            ...createInitialAgentGraphState({
                input: '帮我创建 quiz',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'create_user_calendar_event',
                params: {
                    title: 'COMP3015 Quiz',
                    eventType: 'quiz',
                    eventDate: '2026-05-18',
                },
                missingRequiredFields: [],
                userVisibleSummary: '创建 2026-05-18 的 COMP3015 Quiz 日历事件',
                safeToExecute: true,
            },
        });

        expect(state.confirmation.required).toBe(true);
        expect(state.confirmation.satisfied).toBe(false);
        expect(state.confirmation.prompt).toContain('确认');
    });

    it('marks cancelled when user says 取消', async () => {
        const state = await confirmActionNode({
            ...createInitialAgentGraphState({
                input: '取消',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'write_user_schedule_entry',
                params: { title: 'COMP3015', dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
                missingRequiredFields: [],
                userVisibleSummary: 'Write COMP3015 to schedule',
                safeToExecute: true,
            },
        });

        expect(state.confirmation.cancelled).toBe(true);
        expect(state.pendingAction).toBeNull();
    });

    it('marks satisfied when user confirms', async () => {
        const state = await confirmActionNode({
            ...createInitialAgentGraphState({
                input: '确认',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'write_user_schedule_entry',
                params: { title: 'COMP3015', dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
                missingRequiredFields: [],
                userVisibleSummary: 'Write COMP3015 to schedule',
                safeToExecute: true,
            },
        });

        expect(state.confirmation.satisfied).toBe(true);
        expect(state.confirmation.cancelled).toBeFalsy();
    });
});

describe('executeToolsNode', () => {
    it('dispatches schedule writes to the schedule tool adapter', async () => {
        const state = await executeToolsNode({
            ...createInitialAgentGraphState({
                input: 'confirm',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'write_user_schedule_entry',
                params: {
                    title: 'COMP3015',
                    dayOfWeek: 2,
                    startTime: '09:00',
                    endTime: '10:00',
                },
                missingRequiredFields: [],
                userVisibleSummary: 'write schedule',
                safeToExecute: true,
            },
        });

        expect(mockWriteUserScheduleTool).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            entry: expect.objectContaining({
                title: 'COMP3015',
                dayOfWeek: 2,
            }),
        }));
        expect(state.toolResults[0].toolName).toBe('write_user_schedule_entry');
    });

    it('passes the graph user id into calendar writes', async () => {
        const state = await executeToolsNode({
            ...createInitialAgentGraphState({
                input: 'confirm',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'create_user_calendar_event',
                params: {
                    title: 'COMP3015 Quiz',
                    eventType: 'quiz',
                    eventDate: '2026-05-18',
                    courseCode: 'COMP3015',
                },
                missingRequiredFields: [],
                userVisibleSummary: 'create calendar event',
                safeToExecute: true,
            },
        });

        expect(mockCreateCalendarEventTool).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            title: 'COMP3015 Quiz',
            eventDate: '2026-05-18',
        }));
        expect(state.toolResults[0].toolName).toBe('create_user_calendar_event');
    });

    it('dispatches course review writes to the course community adapter', async () => {
        const state = await executeToolsNode({
            ...createInitialAgentGraphState({
                input: 'confirm',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'post_course_review',
                params: {
                    courseCode: 'COMP3015',
                    rating: 5,
                    content: 'Clear lectures',
                },
                missingRequiredFields: [],
                userVisibleSummary: 'post review',
                safeToExecute: true,
            },
        });

        expect(mockPostCourseReviewTool).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'COMP3015',
            authorId: 'user-1',
            rating: 5,
            content: 'Clear lectures',
        }));
        expect(state.toolResults[0].toolName).toBe('post_course_review');
    });

    it('clears pendingAction after successful execution so completed writes are not replayed', async () => {
        const state = await executeToolsNode({
            ...createInitialAgentGraphState({
                input: 'confirm',
                userId: 'user-1',
                sessionId: 'session-1',
                history: [],
                sessionState: { facts: {}, recentDecisions: [], openLoops: [] },
            }),
            pendingAction: {
                type: 'write_user_schedule_entry',
                params: {
                    title: 'COMP3015',
                    dayOfWeek: 2,
                    startTime: '09:00',
                    endTime: '10:00',
                },
                missingRequiredFields: [],
                userVisibleSummary: 'write schedule',
                safeToExecute: true,
            },
        });

        expect(state.toolResults[0].success).toBe(true);
        expect(state.pendingAction).toBeNull();
    });
});

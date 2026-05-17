import type { AgentGraphState, PendingAction } from '../types';
import { pushTrace } from '../telemetry';

const extractCourseCode = (value: string) => {
    const match = value.toUpperCase().match(/\b([A-Z]{2,6}\s?\d{4}[A-Z]?)\b/);
    return match ? match[1].replace(/\s+/g, '') : undefined;
};

const WEEKDAY_PATTERNS: Array<{ dayOfWeek: number; patterns: RegExp[] }> = [
    { dayOfWeek: 1, patterns: [/monday/i, /mon\b/i, /周一/, /星期一/] },
    { dayOfWeek: 2, patterns: [/tuesday/i, /tue\b/i, /周二/, /星期二/] },
    { dayOfWeek: 3, patterns: [/wednesday/i, /wed\b/i, /周三/, /星期三/] },
    { dayOfWeek: 4, patterns: [/thursday/i, /thu\b/i, /周四/, /星期四/] },
    { dayOfWeek: 5, patterns: [/friday/i, /fri\b/i, /周五/, /星期五/] },
    { dayOfWeek: 6, patterns: [/saturday/i, /sat\b/i, /周六/, /星期六/] },
    { dayOfWeek: 7, patterns: [/sunday/i, /sun\b/i, /周日/, /周天/, /星期日/, /星期天/] },
];

const extractDayOfWeek = (value: string) => (
    WEEKDAY_PATTERNS.find(item => item.patterns.some(pattern => pattern.test(value)))?.dayOfWeek
);

const formatHour = (value: string) => value.padStart(2, '0');

const extractTimeRange = (value: string) => {
    const match = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|~|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (!match) return {};

    return {
        startTime: `${formatHour(match[1])}:${match[2]}`,
        endTime: `${formatHour(match[3])}:${match[4]}`,
    };
};

const extractRating = (value: string) => {
    const match = value.match(/\b([1-5])\s*(?:stars?|星|分)\b/i);
    return match ? Number(match[1]) : undefined;
};

const extractContentAfterSeparator = (value: string) => {
    const match = value.match(/[:：]\s*(.+)$/);
    return match?.[1]?.trim();
};

const buildScheduleAction = (state: AgentGraphState): PendingAction => {
    const courseCode = extractCourseCode(state.input);
    const dayOfWeek = extractDayOfWeek(state.input);
    const timeRange = extractTimeRange(state.input);
    const params = {
        title: courseCode || 'Manual schedule entry',
        courseCode,
        dayOfWeek,
        ...timeRange,
    };
    const hasTime = Boolean(params.startTime && params.endTime);
    const missingRequiredFields = [
        ...(!params.title ? ['title'] : []),
        ...(!dayOfWeek ? ['dayOfWeek'] : []),
        ...(!hasTime ? ['timeRange'] : []),
    ];

    return {
        type: 'write_user_schedule_entry',
        params,
        missingRequiredFields,
        userVisibleSummary: hasTime
            ? `Write ${params.title} to schedule on day ${dayOfWeek}, ${params.startTime}-${params.endTime}`
            : `Write ${params.title} to schedule`,
        safeToExecute: missingRequiredFields.length === 0,
    };
};

const buildCourseReviewAction = (state: AgentGraphState): PendingAction => {
    const courseCode = extractCourseCode(state.input);
    const rating = extractRating(state.input);
    const content = extractContentAfterSeparator(state.input);
    const missingRequiredFields = [
        ...(!courseCode ? ['courseCode'] : []),
        ...(!rating ? ['rating'] : []),
        ...(!content ? ['content'] : []),
    ];

    return {
        type: 'post_course_review',
        params: {
            courseCode,
            rating,
            content,
        },
        missingRequiredFields,
        userVisibleSummary: `Post ${rating || '?'} star review to ${courseCode || 'the course'}`,
        safeToExecute: missingRequiredFields.length === 0,
    };
};

const buildCourseTeamingAction = (state: AgentGraphState): PendingAction => {
    const courseCode = extractCourseCode(state.input);
    const section = state.input.match(/\bsection\s+([A-Za-z0-9-]+)/i)?.[1];
    const content = extractContentAfterSeparator(state.input);
    const missingRequiredFields = [
        ...(!courseCode ? ['courseCode'] : []),
        ...(!section ? ['section'] : []),
        ...(!content ? ['content'] : []),
    ];

    return {
        type: 'post_course_teaming',
        params: {
            courseCode,
            section,
            content,
        },
        missingRequiredFields,
        userVisibleSummary: `Post teaming request to ${courseCode || 'the course'}`,
        safeToExecute: missingRequiredFields.length === 0,
    };
};

const buildCourseChatAction = (state: AgentGraphState): PendingAction => {
    const courseCode = extractCourseCode(state.input);
    const content = extractContentAfterSeparator(state.input);
    const missingRequiredFields = [
        ...(!courseCode ? ['courseCode'] : []),
        ...(!content ? ['content'] : []),
    ];

    return {
        type: 'send_course_chat_message',
        params: {
            courseCode,
            content,
        },
        missingRequiredFields,
        userVisibleSummary: `Send message to ${courseCode || 'the course'} chat`,
        safeToExecute: missingRequiredFields.length === 0,
    };
};

export const prepareActionNode = async (state: AgentGraphState): Promise<AgentGraphState> => {
    if (state.plan.proposedActionType === 'create_user_calendar_event') {
        const courseCode = extractCourseCode(state.input);
        const eventDateMatch = state.input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        const pendingAction = {
            type: 'create_user_calendar_event' as const,
            params: {
                title: courseCode ? `${courseCode} Quiz` : 'Quiz',
                eventType: 'quiz' as const,
                eventDate: eventDateMatch?.[1],
                courseCode,
            },
            missingRequiredFields: eventDateMatch ? [] : ['eventDate'],
            userVisibleSummary: eventDateMatch
                ? `创建 ${eventDateMatch[1]} 的 ${courseCode || 'Quiz'} 日历事件`
                : `创建 ${courseCode || 'Quiz'} 日历事件`,
            safeToExecute: Boolean(eventDateMatch),
        };

        return pushTrace(
            {
                ...state,
                pendingAction,
            },
            'prepare_action',
            pendingAction.userVisibleSummary
        );
    }

    const actionBuilders: Partial<Record<PendingAction['type'], (state: AgentGraphState) => PendingAction>> = {
        write_user_schedule_entry: buildScheduleAction,
        post_course_review: buildCourseReviewAction,
        post_course_teaming: buildCourseTeamingAction,
        send_course_chat_message: buildCourseChatAction,
    };
    const actionBuilder = state.plan.proposedActionType
        ? actionBuilders[state.plan.proposedActionType]
        : undefined;

    if (actionBuilder) {
        const pendingAction = actionBuilder(state);

        return pushTrace(
            {
                ...state,
                pendingAction,
            },
            'prepare_action',
            pendingAction.userVisibleSummary
        );
    }

    return pushTrace(
        {
            ...state,
            clarification: {
                needed: true,
                missingSlots: ['supported_action_type'],
                question: '我暂时还不能安全地准备这个写操作，请先改成课程评论、组队、课表或日历事件。',
                scope: 'action_parameters',
            },
        },
        'prepare_action',
        'unsupported action'
    );
};

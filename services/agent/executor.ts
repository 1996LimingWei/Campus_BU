import { getCurrentUser } from '../auth';
import {
    CalendarEventType,
    createUserCalendarEvent,
    CreateUserCalendarEventInput
} from '../calendar';
import { addReview, getCourseByCode, getReviews, searchCourses } from '../courses';
import { FAQService } from '../faq';
import { createManualScheduleEntry, getUserScheduleEntries, UserScheduleEntry } from '../schedule';
import { supabase } from '../supabase';
import { fetchTeamingRequests, postTeamingRequest } from '../teaming';
import {
    formatBuildingInfo,
    formatNearbyPlaceInfo,
    isBuildingInfoQuery,
    isNearbyPlaceQuery,
} from './campus_queries';
// import { CozeService } from './coze';
import { ContactMethod, Course, CourseTeaming, Review } from '../../types';
import { getCachedValue, getOrSetCachedValue, setCachedValue } from './cache';
import { buildResponseCacheKey, buildToolCacheKey } from './cache_keys';
import { callDeepSeekStream, resolveModelName } from './llm';
import { getAllUserFacts, getMemoryFact, saveMemoryFact } from './memory';
import {
    extractMemoryCandidatesFromConversation,
    filterMemoryCandidates,
} from './memory_extractor';
import { classifyIntent, selectModelRoute } from './router';
import { createInitialSessionState, formatSessionState, updateSessionStateWithTurn } from './session_state';
import { inferStableTask } from './stable_tasks';
import { refineHistorySummary, summarizeHistory } from './summarizer';
import { TOOLS } from './tools';
import { AgentContext, AgentGeoPoint, AgentResponse, AgentStep } from './types';

type ScheduleQueryIntent = 'today' | 'tomorrow' | 'next' | 'weekday' | 'all';

type ParsedScheduleQuery = {
    intent: ScheduleQueryIntent;
    dayOfWeek?: number;
};

const WEEKDAY_LABELS: Record<number, string> = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
    6: '周六',
    7: '周日',
};

const weekdayPatterns: Array<{ dayOfWeek: number; patterns: RegExp[] }> = [
    { dayOfWeek: 1, patterns: [/周一/, /星期一/, /\bmonday\b/i, /\bmon\b/i] },
    { dayOfWeek: 2, patterns: [/周二/, /星期二/, /\btuesday\b/i, /\btue\b/i] },
    { dayOfWeek: 3, patterns: [/周三/, /星期三/, /\bwednesday\b/i, /\bwed\b/i] },
    { dayOfWeek: 4, patterns: [/周四/, /星期四/, /\bthursday\b/i, /\bthu\b/i, /\bthur\b/i] },
    { dayOfWeek: 5, patterns: [/周五/, /星期五/, /\bfriday\b/i, /\bfri\b/i] },
    { dayOfWeek: 6, patterns: [/周六/, /星期六/, /\bsaturday\b/i, /\bsat\b/i] },
    { dayOfWeek: 7, patterns: [/周日/, /星期日/, /周天/, /星期天/, /\bsunday\b/i, /\bsun\b/i] },
];

const getHongKongNow = (): Date => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(new Date());

    const part = (type: string, fallback: string) => parts.find(item => item.type === type)?.value || fallback;
    const year = Number(part('year', '2026'));
    const month = Number(part('month', '01')) - 1;
    const day = Number(part('day', '01'));
    const hour = Number(part('hour', '00'));
    const minute = Number(part('minute', '00'));
    const second = Number(part('second', '00'));

    return new Date(year, month, day, hour, minute, second);
};

const getHongKongDayOfWeek = (offsetDays = 0): number => {
    const now = getHongKongNow();
    now.setDate(now.getDate() + offsetDays);
    const day = now.getDay();
    return day === 0 ? 7 : day;
};

const isDateQuery = (query: string): boolean => {
    return /今天.*周几|今天星期几|今天週幾|今天是星期幾|今天是周几|今日.*周几|today.*what day|what day is it today|明天.*周几|明天星期几|明天週幾|明天是星期幾|明天是周几|tomorrow.*what day/i.test(query);
};

const getDayLabel = (dayOfWeek: number): string => WEEKDAY_LABELS[dayOfWeek] || `周${dayOfWeek}`;

const toMinutes = (value?: string): number | null => {
    if (!value) return null;
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

const getEntrySortValue = (entry: UserScheduleEntry): number => {
    const startMinutes = getEntryStartMinutes(entry);
    if (startMinutes !== null) return startMinutes;
    return Number.MAX_SAFE_INTEGER;
};

const getEntryStartMinutes = (entry: Pick<UserScheduleEntry, 'startTime' | 'startPeriod'>): number | null => {
    const startMinutes = toMinutes(entry.startTime);
    if (startMinutes !== null) return startMinutes;
    if (typeof entry.startPeriod === 'number') return entry.startPeriod * 60;
    return null;
};

const formatScheduleEntry = (entry: UserScheduleEntry): string => {
    const title = entry.courseCode ? `${entry.title} (${entry.courseCode})` : entry.title;
    const timeText = entry.startTime && entry.endTime
        ? `${entry.startTime}-${entry.endTime}`
        : (entry.weekText || '时间待确认');
    const roomText = entry.room ? `，地点 ${entry.room}` : '';
    return `${timeText} ${title}${roomText}`;
};

const parseScheduleQuery = (query: string): ParsedScheduleQuery => {
    const normalized = query.trim();

    if (/下一节|下节|下一堂|next class/i.test(normalized)) {
        return { intent: 'next', dayOfWeek: getHongKongDayOfWeek() };
    }

    if (/明天|tomorrow/i.test(normalized)) {
        return { intent: 'tomorrow', dayOfWeek: getHongKongDayOfWeek(1) };
    }

    for (const item of weekdayPatterns) {
        if (item.patterns.some(pattern => pattern.test(normalized))) {
            return { intent: 'weekday', dayOfWeek: item.dayOfWeek };
        }
    }

    if (/今天|今日|today/i.test(normalized)) {
        return { intent: 'today', dayOfWeek: getHongKongDayOfWeek() };
    }

    return { intent: 'all' };
};

const formatScheduleSummary = (entries: UserScheduleEntry[], label: string): string => {
    if (entries.length === 0) {
        return `${label}没有课。`;
    }

    const lines = entries
        .sort((a, b) => getEntrySortValue(a) - getEntrySortValue(b))
        .map((entry, index) => `${index + 1}. ${formatScheduleEntry(entry)}`);

    return `${label}共有 ${entries.length} 节课：\n${lines.join('\n')}`;
};

type CourseCommunityScope = 'reviews' | 'chat' | 'teaming' | 'all';
type CoursePublishIntent = 'review' | 'chat' | 'teaming';

type PendingCourseAction = {
    intent: CoursePublishIntent;
    course: Course | null;
    courseQuery?: string;
    content?: string;
    rating?: number;
    section?: string;
    targetTeammate?: string;
    contacts?: ContactMethod[];
};

type ScheduleWriteDraft = {
    title?: string;
    courseCode?: string;
    teacherName?: string;
    room?: string;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    startPeriod?: number;
    endPeriod?: number;
    weekText?: string;
};

type CalendarEventDraft = {
    title?: string;
    eventType?: CalendarEventType;
    courseCode?: string;
    matchedCourseId?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    note?: string;
};

type PendingWriteAction =
    | {
        type: 'course';
        action: PendingCourseAction;
    }
    | {
        type: 'memory';
        key: string;
        value: any;
    }
    | {
        type: 'schedule';
        entry: ScheduleWriteDraft;
    }
    | {
        type: 'calendar_event';
        event: CalendarEventDraft;
    };

const extractCourseCode = (query: string): string | null => {
    const match = query.toUpperCase().match(/\b([A-Z]{2,6}\s?\d{4}[A-Z]?)\b/);
    if (!match) return null;
    return match[1].replace(/\s+/g, '');
};

const extractCourseSearchTerm = (query: string): string => {
    const withoutCode = query.replace(/\b[A-Za-z]{2,6}\s?\d{4}[A-Za-z]?\b/g, ' ');
    const cleaned = withoutCode
        .replace(/课程|这门课|这堂课|评价|評價|点评|點評|review|reviews|chatroom|chat|聊天室|群聊|消息|teaming|组队|組隊|队友|隊友|情况|情況|怎么样|怎麼樣|如何|看看|想看|读取|讀取|read|about/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned;
};

const detectCourseCommunityScope = (query: string): CourseCommunityScope => {
    if (/聊天室|群聊|chatroom|chat|message/i.test(query)) return 'chat';
    if (/组队|組隊|队友|隊友|teaming|teammate|team up/i.test(query)) return 'teaming';
    if (/评价|評價|点评|點評|review|reviews|口碑/i.test(query)) return 'reviews';
    return 'all';
};

const isScheduleQuery = (query: string): boolean => {
    return /课表|課表|课程安排|課程安排|今天.*课|今天.*課|明天.*课|明天.*課|周[一二三四五六日天].*课|星期[一二三四五六日天].*课|下一节|下节|下一堂|next class|today.*class|tomorrow.*class/i.test(query);
};

const isScheduleWriteIntent = (query: string): boolean => {
    // Intent to write a course to schedule: e.g., "帮我把这门课记进课表", "周二9点有课帮我记一下"
    return /(?:帮我|幫我|替我|帮|幫).*(?:记|記|加|写|寫|放|存|添加).*(?:课表|課表|课程|課程|时间表|時間表)/i.test(query) ||
           /(?:把|將).*(?:课|課|课程|課程).*(?:记到|記到|写到|寫到|加到|放到|存到|添加).*(?:课表|課表|时间表)/i.test(query);
};

const isCalendarEventWriteIntent = (query: string): boolean => {
    // Intent to write a one-time event: exam, quiz, assignment deadline, etc.
    return /(?:帮我|幫我|替我|帮|幫).*(?:记|記|加|写|寫|放|存|添加).*(?:考试|考試|quiz|midterm|final|exam|测验|測驗|作业|作業|assignment|deadline|due|presentation|pre)/i.test(query) ||
           /(?:把|將).*(?:考试|考試|quiz|midterm|final|exam|测验|測驗|作业|作業|assignment|deadline|due).*(?:记到|記到|写到|寫到|加到|放到|存到|日历|日曆|日历|時間表)/i.test(query);
};

const isCourseCommunityQuery = (query: string): boolean => {
    const hasCourseIdentity = Boolean(extractCourseCode(query)) || /这门课|這門課|这堂课|這堂課|课程|課程/.test(query);
    const hasCommunityIntent = /评价|評價|点评|點評|review|reviews|聊天室|群聊|chatroom|chat|message|teaming|组队|組隊|队友|隊友|口碑|怎么样|怎麼樣|如何|值得上吗|值得上嗎|好不好|活跃吗|活躍嗎/.test(query);
    return hasCommunityIntent && hasCourseIdentity;
};

const isCampusFaqQuery = (query: string): boolean => {
    return /图书馆|圖書館|library|main lib|gpa|绩点|績點|平均分|校历|校曆|academic calendar|calendar|add\/drop|add drop|选课|選課|reg course|注册|註冊|学费|學費|tuition|fee|奖学金|獎學金|financial aid|资助|資助|宿舍|住宿|hall\b|residence|wifi|eduroam|internet|网络|網絡|it service|it support|ito|邮箱|郵箱|email|成绩单|成績單|transcript|student handbook|handbook|学生手册|學生手冊|admission|入学|入學|accept offer|录取|錄取|签证|簽證|visa|iang|留位费|留位費|deposit|押金|缴费|繳費|付款|payment|flywire|电汇|電匯|汇票|匯票|食堂|canteen|餐厅|餐廳|吃饭|吃飯|饭堂|飯堂|医疗|醫療|看病|医生|醫生|校医|校醫|诊所|診所|health|clinic|体育|體育|健身|gym|游泳|swimming|运动|運動|sport|打印|print|复印|複印|租房|租屋|rent|搬家|交通|transport|地铁|地鐵|巴士|bus|小巴|minibus|抵港|来港|來港|到港|入境|landing slip|d签|d簽|逗留签|逗留簽|offer|录取通知|錄取通知|新生|freshman|orientation|迎新|报到|報到|电话卡|電話卡|sim card|八达通|八達通|octopus|银行开户|銀行開戶|bank account|app|moodle|duo/i.test(query);
};

const isPersonalizedPrompt = (query: string): boolean => {
    return /我的|我嘅|my\b|me\b|帮我|幫我|替我|我的课表|我的課表|我今天|我明天|我的成绩|我的成績|我的课程|我的課程/.test(query.toLowerCase());
};

const isLowRiskResponseCacheable = (query: string, historyLength: number): boolean => {
    if (historyLength !== 1) return false;
    if (isPersonalizedPrompt(query)) return false;
    if (detectCoursePublishIntent(query)) return false;
    if (isScheduleQuery(query) || isCourseCommunityQuery(query) || isNearbyPlaceQuery(query) || isBuildingInfoQuery(query)) {
        return false;
    }
    return query.trim().length > 0;
};

const detectCoursePublishIntent = (query: string): CoursePublishIntent | null => {
    if (/我(?:想|希望|要)(?:要)?组队|我(?:想|希望|要)(?:要)?組隊|帮我组队|幫我組隊|发布组队|發布組隊|发组队|發組隊|找队友|找隊友|想找队友|想找隊友|想找组员|想找組員|组队帖|組隊帖|teaming post|team up|用户想组队|用戶想組隊/i.test(query)) {
        return 'teaming';
    }

    if (/(发|發|写|寫|发布|發布|提交|帮我发|幫我發|帮我写|幫我寫).*(评价|評價|点评|點評|review)|评价.*(发|發|写|寫|发布|發布|提交)|点评.*(发|發|写|寫|发布|發布|提交)/i.test(query)) {
        return 'review';
    }

    if (/(发|發|发送|傳送|帮我发|幫我發|帮我说|幫我說|替我发|替我發).*(聊天室|群聊|chatroom|chat)|在.*(聊天室|群聊|chatroom|chat).*(发|發|说|說|留言|message)|聊天室.*(发|發|说|說|留言)|群聊.*(发|發|说|說|留言)/i.test(query)) {
        return 'chat';
    }

    return null;
};

const isCancelActionQuery = (query: string): boolean =>
    /^(取消|算了|不用了|先不用|停止|cancel|never mind)(一下|吧|啦|了)?[！!。.]?$/i.test(query.trim());

const isConfirmActionQuery = (query: string): boolean =>
    /^(是|好的|好|确认|確認|可以|行|就这样|就這樣|没问题|沒問題|yes|ok|okay|confirm|send|发送|發送)(一下|下|吧|啦|了)?[！!。.]?$/i.test(query.trim());

const hasConfirmKeyword = (query: string): boolean =>
    /(?:确认|確認|confirm|yes|ok|okay|send|发送|發送|就这样|就這樣|没问题|沒問題)/i.test(query);

const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
    exam: '考试',
    quiz: '测验',
    assignment: '作业',
    custom: '事件',
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const normalizeHour = (hour: number, meridiem?: string): number => {
    if (!meridiem) return hour;
    if (/下午|晚上/i.test(meridiem) && hour < 12) return hour + 12;
    if (/中午/i.test(meridiem) && hour < 11) return hour + 12;
    if (/上午/i.test(meridiem) && hour === 12) return 0;
    return hour;
};

const toTimeString = (hour: number, minute: number, meridiem?: string): string => {
    const normalizedHour = normalizeHour(hour, meridiem);
    return `${pad2(normalizedHour)}:${pad2(minute)}`;
};

const addOneHour = (time: string): string => {
    const [hourText, minuteText] = time.split(':');
    const date = new Date(2026, 0, 1, Number(hourText), Number(minuteText), 0, 0);
    date.setHours(date.getHours() + 1);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const extractDayOfWeek = (query: string): number | undefined => {
    for (const item of weekdayPatterns) {
        if (item.patterns.some(pattern => pattern.test(query))) {
            return item.dayOfWeek;
        }
    }
    return undefined;
};

const extractTimeRange = (query: string): {
    startTime?: string;
    endTime?: string;
} => {
    const compactRangeMatch = query.match(/\b(\d{1,2}:\d{2})\s*(?:-|到|至|~)\s*(\d{1,2}:\d{2})\b/);
    if (compactRangeMatch) {
        return {
            startTime: compactRangeMatch[1],
            endTime: compactRangeMatch[2],
        };
    }

    const rangeMatch = query.match(
        /(上午|中午|下午|晚上)?\s*(\d{1,2})(?::|点|點)?(\d{2})?\s*(?:-|到|至|~)\s*(上午|中午|下午|晚上)?\s*(\d{1,2})(?::|点|點)?(\d{2})?/i
    );

    if (rangeMatch) {
        return {
            startTime: toTimeString(Number(rangeMatch[2]), Number(rangeMatch[3] || '0'), rangeMatch[1]),
            endTime: toTimeString(Number(rangeMatch[5]), Number(rangeMatch[6] || '0'), rangeMatch[4] || rangeMatch[1]),
        };
    }

    const singleMatch = query.match(/(?:^|[^\d])(?:上午|中午|下午|晚上)?\s*(\d{1,2})(?::|点|點)(\d{2})?(?=$|[^\d])/i);
    if (singleMatch) {
        const startTime = toTimeString(Number(singleMatch[1]), Number(singleMatch[2] || '0'));
        return {
            startTime,
            endTime: addOneHour(startTime),
        };
    }

    return {};
};

const extractPeriods = (query: string): { startPeriod?: number; endPeriod?: number } => {
    const match = query.match(/第?\s*(\d{1,2})\s*[-到至~]\s*(\d{1,2})\s*节/i);
    if (!match) return {};
    return {
        startPeriod: Number(match[1]),
        endPeriod: Number(match[2]),
    };
};

const extractRoomLikeValue = (query: string): string | undefined => {
    const patterns = [
        /(?:在|@)\s*([A-Za-z]{2,}[ -]?\d{2,}[A-Za-z]?)/,
        /(?:教室|地点|location|room)\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
        /^\s*([A-Za-z]{2,3}[ -]?\d{2,3}[A-Za-z]?)\s*$/i,
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        const value = match?.[1]?.trim();
        if (value) {
            return value.replace(/\s+/g, '');
        }
    }

    return undefined;
};

const inferYearForMonthDay = (month: number, day: number): number => {
    const now = getHongKongNow();
    let year = now.getFullYear();
    const inferred = new Date(year, month - 1, day);
    if (inferred < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) {
        year += 1;
    }
    return year;
};

const extractEventDate = (query: string): string | undefined => {
    const isoMatch = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) return isoMatch[1];

    const mdMatch = query.match(/(\d{1,2})月(\d{1,2})(?:日|号)/);
    if (mdMatch) {
        const month = Number(mdMatch[1]);
        const day = Number(mdMatch[2]);
        const year = inferYearForMonthDay(month, day);
        return `${year}-${pad2(month)}-${pad2(day)}`;
    }

    if (/明天/i.test(query)) {
        const date = getHongKongNow();
        date.setDate(date.getDate() + 1);
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    if (/今天|今日|today/i.test(query)) {
        const date = getHongKongNow();
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    return undefined;
};

const detectCalendarEventType = (query: string): CalendarEventType | undefined => {
    if (/quiz|测验|小测/i.test(query)) return 'quiz';
    if (/assignment|作业|deadline|due/i.test(query)) return 'assignment';
    if (/exam|final|midterm|考试/i.test(query)) return 'exam';
    if (/event|日程|提醒|presentation|展示/i.test(query)) return 'custom';
    return undefined;
};

const deriveScheduleTitle = (query: string, courseCode?: string): string | undefined => {
    if (courseCode) return courseCode;
    const courseNameMatch = query.match(/([A-Za-z0-9\u4e00-\u9fa5]{2,30}?)(?:课程|这门课|这堂课|课)/);
    if (courseNameMatch?.[1]) {
        return courseNameMatch[1].trim();
    }
    return undefined;
};

const deriveCalendarEventTitle = (
    query: string,
    courseCode?: string,
    eventType?: CalendarEventType
): string | undefined => {
    if (courseCode && eventType === 'exam') return `${courseCode} Final Exam`;
    if (courseCode && eventType === 'quiz') return `${courseCode} Quiz`;
    if (courseCode && eventType === 'assignment') return `${courseCode} Assignment`;
    if (courseCode && eventType === 'custom') return `${courseCode} Event`;

    // 尝试提取显式标题（如"记一下XXX"）
    const explicitMatch = query.match(/记(?:个|一下)?\s*([A-Za-z0-9\u4e00-\u9fa5 ]{2,40})/);
    if (explicitMatch?.[1]) {
        return explicitMatch[1].trim();
    }

    // 如果没有课程代码和显式标题，根据事件类型返回默认标题
    if (eventType === 'assignment') return '作业';
    if (eventType === 'exam') return '考试';
    if (eventType === 'quiz') return '测验';
    
    return undefined;
};

const mergeDefined = <T extends Record<string, any>>(base: T, patch: T): T => {
    const next = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined && value !== null && value !== '') {
            (next as any)[key] = value;
        }
    }
    return next;
};

const mergeScheduleDraft = (base: ScheduleWriteDraft, patch: ScheduleWriteDraft): ScheduleWriteDraft =>
    mergeDefined(base, patch);

const mergeCalendarEventDraft = (base: CalendarEventDraft, patch: CalendarEventDraft): CalendarEventDraft =>
    mergeDefined(base, patch);

const parseScheduleWriteDraft = (query: string): ScheduleWriteDraft => {
    const courseCode = extractCourseCode(query) || undefined;
    const { startTime, endTime } = extractTimeRange(query);
    const { startPeriod, endPeriod } = extractPeriods(query);
    return {
        title: deriveScheduleTitle(query, courseCode),
        courseCode,
        room: extractRoomLikeValue(query),
        dayOfWeek: extractDayOfWeek(query),
        startTime,
        endTime,
        startPeriod,
        endPeriod,
    };
};

const parseCalendarEventDraft = (query: string): CalendarEventDraft => {
    const courseCode = extractCourseCode(query) || undefined;
    const eventType = detectCalendarEventType(query);
    const { startTime, endTime } = extractTimeRange(query);
    return {
        title: deriveCalendarEventTitle(query, courseCode, eventType),
        courseCode,
        eventType,
        eventDate: extractEventDate(query),
        startTime,
        endTime,
        location: extractRoomLikeValue(query),
    };
};

const hasScheduleDraftUpdates = (draft: ScheduleWriteDraft): boolean => {
    return Boolean(
        draft.title ||
        draft.courseCode ||
        draft.teacherName ||
        draft.room ||
        draft.dayOfWeek ||
        draft.startTime ||
        draft.endTime ||
        draft.startPeriod ||
        draft.endPeriod ||
        draft.weekText
    );
};

const hasCalendarEventDraftUpdates = (draft: CalendarEventDraft): boolean => {
    return Boolean(
        draft.title ||
        draft.eventType ||
        draft.courseCode ||
        draft.matchedCourseId ||
        draft.eventDate ||
        draft.startTime ||
        draft.endTime ||
        draft.location ||
        draft.note
    );
};

const getMissingScheduleFields = (draft: ScheduleWriteDraft): string[] => {
    const missing: string[] = [];
    if (!draft.title) missing.push('课程名称');
    if (!draft.dayOfWeek) missing.push('星期几');
    if (!draft.room) missing.push('教室');
    const hasTime = Boolean(draft.startTime && draft.endTime);
    const hasPeriod = Boolean(draft.startPeriod && draft.endPeriod);
    if (!hasTime && !hasPeriod) missing.push('时间');
    return missing;
};

const getMissingCalendarEventFields = (draft: CalendarEventDraft): string[] => {
    const missing: string[] = [];
    if (!draft.title) missing.push('课程名称');
    if (!draft.eventType) missing.push('事件类型');
    if (!draft.eventDate) missing.push('日期');
    // 所有事件类型（考试、测验、作业、自定义）的时间和地点都是可选的
    return missing;
};

const formatMissingFieldsPrompt = (fields: string[], kind: 'schedule' | 'calendar_event'): string => {
    const fieldText = fields.join('、');
    if (kind === 'schedule') {
        return `要帮你写进课表，我还需要这些信息：${fieldText}。你直接补一句就行，比如“周二 09:00-10:00 在 WLB204”。`;
    }
    return `要帮你写进日历，我还需要这些信息：${fieldText}。你直接补一句就行，比如“2026-05-15 14:00-16:00 在 HSH201”。`;
};

const toScheduleEntry = (
    draft: ScheduleWriteDraft
): Omit<UserScheduleEntry, 'id' | 'userId' | 'source'> | null => {
    const missing = getMissingScheduleFields(draft);
    if (missing.length > 0 || !draft.title || !draft.dayOfWeek) return null;

    return {
        title: draft.title,
        courseCode: draft.courseCode,
        teacherName: draft.teacherName,
        room: draft.room,
        dayOfWeek: draft.dayOfWeek,
        startTime: draft.startTime,
        endTime: draft.endTime,
        startPeriod: draft.startPeriod,
        endPeriod: draft.endPeriod,
        weekText: draft.weekText?.trim() || '1-16',
        matchedCourseId: undefined,
        isActive: true,
    };
};

const toCalendarEventInput = (
    draft: CalendarEventDraft
): Omit<CreateUserCalendarEventInput, 'userId'> | null => {
    const missing = getMissingCalendarEventFields(draft);
    if (
        missing.length > 0 ||
        !draft.title ||
        !draft.eventType ||
        !draft.eventDate
    ) {
        return null;
    }

    // 所有事件类型（考试、测验、作业、自定义）的时间和地点都是可选的
    return {
        title: draft.title,
        eventType: draft.eventType,
        courseCode: draft.courseCode,
        matchedCourseId: draft.matchedCourseId,
        eventDate: draft.eventDate,
        startTime: draft.startTime || undefined,
        endTime: draft.endTime || (draft.startTime ? addOneHour(draft.startTime) : undefined),
        location: draft.location || undefined,
        note: draft.note,
    };
};

const extractDelimitedContent = (query: string): string | undefined => {
    const match = query.match(/[：:]\s*(.+)$/);
    const value = match?.[1]?.trim();
    return value || undefined;
};

const stripCourseActionPhrases = (query: string): string => query
    .replace(/\b[A-Za-z]{2,6}\s?\d{4}[A-Za-z]?\b/g, ' ')
    .replace(/^(请|請)?\s*(帮我发|幫我發|帮我写|幫我寫|帮我说|幫我說|替我发|替我發|发布|發布|提交|发送|傳送)\s*/i, '')
    .replace(/^(我(?:想|希望|要)(?:要)?组队|我(?:想|希望|要)(?:要)?組隊|帮我组队|幫我組隊|发布组队|發布組隊|发组队|發組隊)\s*/i, '')
    .replace(/^(评价|評價|点评|點評|review|聊天室|群聊|chatroom|chat|message|消息)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const extractRating = (query: string): number | undefined => {
    const patterns = [
        /([1-5](?:\.\d)?)\s*(星|stars?)/i,
        /评分[是為为]?\s*([1-5](?:\.\d)?)/i,
        /打\s*([1-5](?:\.\d)?)\s*星/i,
        /([1-5](?:\.\d)?)\s*分/i,
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) {
            const rating = Number(match[1]);
            if (rating >= 1 && rating <= 5) {
                return rating;
            }
        }
    }

    return undefined;
};

const extractSection = (query: string): string | undefined => {
    const patterns = [
        /\bsec(?:tion)?\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
        /\bsection\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
        /(?:第?\s*|)([A-Za-z]?\d{1,2})\s*(?:班|组|組)\b/i,
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        const value = match?.[1]?.trim();
        if (value) return value.toUpperCase();
    }

    return undefined;
};

const extractTargetTeammate = (query: string): string | undefined => {
    const match = query.match(/(?:想找|想搵|希望找|目标队友|目標隊友|prefer|looking for)\s*[:：]?\s*([^，。,\n]+)/i);
    return match?.[1]?.trim() || undefined;
};

const extractEmailAddress = (query: string): string | undefined => {
    const match = query.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    return match?.[0];
};

const extractContacts = (query: string, fallbackEmail?: string): ContactMethod[] => {
    const contacts: ContactMethod[] = [];
    const add = (platform: ContactMethod['platform'], value?: string, otherPlatformName?: string) => {
        const trimmed = value?.trim();
        if (!trimmed) return;
        if (contacts.some(item => item.platform === platform && item.value === trimmed)) return;
        contacts.push({ platform, value: trimmed, otherPlatformName });
    };

    const wechat = query.match(/(?:微信|wechat|wx)\s*[:：]?\s*([A-Za-z0-9._-]+)/i);
    add('WeChat', wechat?.[1]);

    const whatsapp = query.match(/(?:whatsapp|wa)\s*[:：]?\s*([+\d][\d\s-]{5,})/i);
    add('WhatsApp', whatsapp?.[1]?.replace(/\s+/g, ''));

    const telegram = query.match(/(?:telegram|tg)\s*[:：]?\s*@?([A-Za-z0-9_]{3,})/i);
    add('Telegram', telegram?.[1] ? `@${telegram[1].replace(/^@/, '')}` : undefined);

    const instagram = query.match(/(?:instagram|ig)\s*[:：]?\s*@?([A-Za-z0-9._]{3,})/i);
    add('Instagram', instagram?.[1] ? `@${instagram[1].replace(/^@/, '')}` : undefined);

    const email = extractEmailAddress(query) || fallbackEmail;
    add('Email', email);

    return contacts;
};

const looksLikeStandaloneCourseReply = (query: string): boolean => {
    const normalized = query.trim();
    return Boolean(extractCourseCode(normalized)) && stripCourseActionPhrases(normalized) === '';
};

const extractFreeformContent = (query: string): string | undefined => {
    const delimited = extractDelimitedContent(query);
    if (delimited) return delimited;

    const stripped = stripCourseActionPhrases(query);
    return stripped.length >= 4 ? stripped : undefined;
};

const isAgentMetaQuery = (query: string): boolean =>
    /^(用户|用戶|user)\s*(想|要|正在|需要)|先了解|先确认|先確認|具体课程|具體課程|需要先/.test(query.trim());

const normalizeAssistantReply = (reply?: string): string | undefined => {
    if (!reply) return reply;

    if (/用户想组队|用戶想組隊/.test(reply) && /课程|課程/.test(reply)) {
        return '我先接着帮你看组队这件事。前面的聊天里还没有明确课程，你把课程代码发我一下，我继续帮你往下处理。';
    }

    if (/需要现在的课程信息|需要.*课程信息|需要.*課程信息/.test(reply)) {
        return '我先接着往下帮你处理，不过前面的聊天里还没有明确课程。你把课程代码发我一下，我继续。';
    }

    return reply;
};

const formatReviewSummary = (reviews: Review[], course: Course): string => {
    if (reviews.length === 0) {
        return `${course.code} 目前还没有评价。`;
    }

    const ratedReviews = reviews.filter(review => typeof review.rating === 'number');
    const average = ratedReviews.length > 0
        ? (ratedReviews.reduce((sum, review) => sum + (review.rating || 0), 0) / ratedReviews.length).toFixed(1)
        : null;
    const preview = reviews.slice(0, 3).map((review, index) => {
        const ratingText = typeof review.rating === 'number' ? ` ${review.rating}星` : '';
        const content = review.content.length > 80 ? `${review.content.slice(0, 80)}...` : review.content;
        return `${index + 1}. ${review.authorName}${ratingText}：${content}`;
    });

    const header = average
        ? `${course.code} 目前有 ${reviews.length} 条评价，平均约 ${average} 星。`
        : `${course.code} 目前有 ${reviews.length} 条文字评价。`;

    return `${header}\n${preview.join('\n')}`;
};

const formatChatSummary = (messages: any[], course: Course): string => {
    if (messages.length === 0) {
        return `${course.code} 聊天室目前还没有消息。`;
    }

    const preview = messages.slice(-5).map((message: any, index: number) => {
        const author = message.users?.display_name || message.sender_id || '匿名同学';
        const content = String(message.content || '').replace(/\s+/g, ' ').trim();
        const shortened = content.length > 60 ? `${content.slice(0, 60)}...` : content;
        return `${index + 1}. ${author}：${shortened}`;
    });

    return `${course.code} 聊天室最近有 ${messages.length} 条消息，最新几条是：\n${preview.join('\n')}`;
};

const formatTeamingSummary = (requests: CourseTeaming[], course: Course): string => {
    if (requests.length === 0) {
        return `${course.code} 目前还没有公开的 teaming 帖子。`;
    }

    const preview = requests.slice(0, 3).map((item, index) => {
        const intro = item.selfIntro
            ? (item.selfIntro.length > 60 ? `${item.selfIntro.slice(0, 60)}...` : item.selfIntro)
            : '没有填写自我介绍';
        const target = item.targetTeammate ? `；想找 ${item.targetTeammate}` : '';
        return `${index + 1}. ${item.userName} [section ${item.section}]：${intro}${target}`;
    });

    return `${course.code} 目前有 ${requests.length} 条 teaming 帖子：\n${preview.join('\n')}`;
};

const buildCourseCommunityIdCandidates = async (course: Course, query: string): Promise<string[]> => {
    const candidates = new Set<string>();
    const codeFromQuery = extractCourseCode(query);
    const normalizedCode = (course.code || codeFromQuery || '').toUpperCase().replace(/\s+/g, '');
    const lowerCode = normalizedCode.toLowerCase();

    if (course.id) {
        candidates.add(course.id);
        candidates.add(String(course.id).toLowerCase());
        candidates.add(String(course.id).toUpperCase());
    }

    if (normalizedCode) {
        candidates.add(normalizedCode);
        candidates.add(lowerCode);
        candidates.add(`local_${normalizedCode}`);
        candidates.add(`local_${lowerCode}`);
    }

    if (codeFromQuery) {
        candidates.add(codeFromQuery);
        candidates.add(codeFromQuery.toLowerCase());
        candidates.add(`local_${codeFromQuery}`);
        candidates.add(`local_${codeFromQuery.toLowerCase()}`);
    }

    const byCode = normalizedCode ? await getCourseByCode(normalizedCode) : null;
    if (byCode?.id) {
        candidates.add(byCode.id);
    }

    return Array.from(candidates).filter(Boolean);
};

/**
 * The AgentExecutor handles the ReAct (Reasoning + Acting) loop.
 * It coordinates between the LLM and the local Tools.
 */
export class AgentExecutor {
    private context: AgentContext;
    private static readonly MAX_HISTORY_ITEMS = 12;
    private static readonly MAX_RECENT_HISTORY_ITEMS = 6;
    private static readonly POST_RESPONSE_MEMORY_TURN_WINDOW = 3;
    private static readonly POST_RESPONSE_MEMORY_WRITE_LIMIT = 3;
    private static readonly CACHE_TTLS = {
        read_user_schedule: 60 * 1000,
        read_campus_building: 10 * 60 * 1000,
        find_nearby_place: 90 * 1000,
        read_course_community: 2 * 60 * 1000,
        search_campus_faq: 10 * 60 * 1000,
        direct_llm_reply: 10 * 60 * 1000,
    } as const;
    private pendingCourseAction: PendingCourseAction | null = null;
    private pendingWriteAction: PendingWriteAction | null = null;
    private turnsSinceSummaryRefresh = 0;

    constructor(userId: string) {
        this.context = {
            userId,
            sessionId: `session_${Date.now()}`,
            history: [],
            historySummary: '',
            sessionState: createInitialSessionState(),
            deviceLocation: null,
        };
    }

    setDeviceLocation(location: AgentGeoPoint | null) {
        this.context.deviceLocation = location;
    }

    private pushHistory(role: 'user' | 'assistant' | 'tool', content: string) {
        const item = { role, content } as const;
        this.context.history.push(item);
        this.context.sessionState = updateSessionStateWithTurn(this.context.sessionState, item);
        if (role === 'user' && this.context.historySummary) {
            this.turnsSinceSummaryRefresh += 1;
        }
        if (this.context.history.length > AgentExecutor.MAX_HISTORY_ITEMS) {
            const summarized = summarizeHistory(this.context.history, {
                keepRecent: AgentExecutor.MAX_RECENT_HISTORY_ITEMS,
            });
            this.context.historySummary = [this.context.historySummary, summarized.summary].filter(Boolean).join('\n');
            this.context.sessionState.summary = this.context.historySummary;
            this.context.history = summarized.recentHistory;
        }
    }

    private async maybeRefreshHistorySummary(): Promise<void> {
        if (!this.context.historySummary || this.turnsSinceSummaryRefresh < 2) {
            return;
        }

        const refinedSummary = await refineHistorySummary({
            historySummary: this.context.historySummary,
            recentHistory: this.context.history,
            sessionStateText: formatSessionState(this.context.sessionState),
        });

        if (refinedSummary) {
            this.context.historySummary = refinedSummary;
            this.context.sessionState.summary = refinedSummary;
        }

        this.turnsSinceSummaryRefresh = 0;
    }

    private getRecentConversationContext(): string {
        const parts = [
            `Structured session state:\n${formatSessionState(this.context.sessionState)}`,
            this.context.historySummary ? this.context.historySummary : '',
            this.context.history.length > 0
                ? this.context.history
                    .slice(-AgentExecutor.MAX_RECENT_HISTORY_ITEMS)
                    .map(item => `${item.role}: ${item.content}`)
                    .join('\n')
                : 'No prior conversation.'
        ].filter(Boolean);

        return parts.join('\n\n');
    }

    private async runPostResponseMemoryPass(): Promise<void> {
        try {
            const recentTurns = this.context.history.slice(-AgentExecutor.POST_RESPONSE_MEMORY_TURN_WINDOW);
            const existingFacts = await getAllUserFacts(this.context.userId);
            const candidates = await extractMemoryCandidatesFromConversation({ recentTurns });
            const acceptedMemories = filterMemoryCandidates(candidates, existingFacts)
                .slice(0, AgentExecutor.POST_RESPONSE_MEMORY_WRITE_LIMIT);

            for (const memory of acceptedMemories) {
                await saveMemoryFact(this.context.userId, memory.key, memory.value);
            }
        } catch (error) {
            console.warn('[Agent] post-response memory pass skipped:', error);
        }
    }

    private async finalizeAgentResponse(
        response: AgentResponse,
        options?: {
            responseCacheKey?: string | null;
            shouldCacheDirectReply?: boolean;
            runPostResponseMemoryPass?: boolean;
        }
    ): Promise<AgentResponse> {
        if (!response.finalAnswer) {
            return response;
        }

        const normalizedAnswer = normalizeAssistantReply(response.finalAnswer);
        response.finalAnswer = normalizedAnswer;
        if (!normalizedAnswer) {
            return response;
        }

        this.pushHistory('assistant', normalizedAnswer);

        if (options?.shouldCacheDirectReply && options.responseCacheKey) {
            setCachedValue(options.responseCacheKey, normalizedAnswer, AgentExecutor.CACHE_TTLS.direct_llm_reply);
        }

        if (options?.runPostResponseMemoryPass !== false) {
            // Fire-and-forget: memory extraction runs in background so the user
            // doesn't wait an extra 5-7 seconds for the DeepSeek LLM call.
            this.runPostResponseMemoryPass().catch((err) => {
                console.warn('[Agent] background memory pass failed:', err);
            });
        }

        return response;
    }

    /**
     * Main entry point for user prompts
     */
    async process(prompt: string, onUpdate?: (text: string) => void): Promise<AgentResponse> {
        this.pushHistory('user', prompt);
        await this.maybeRefreshHistorySummary();

        const pendingWriteResponse = await this.continuePendingWriteAction(prompt);
        if (pendingWriteResponse) {
            return this.finalizeAgentResponse(pendingWriteResponse, {
                runPostResponseMemoryPass: false,
            });
        }

        const pendingResponse = await this.continuePendingCourseAction(prompt);
        if (pendingResponse) {
            return this.finalizeAgentResponse(pendingResponse);
        }

        const stableTaskResponse = await this.tryStableTaskRoute(prompt);
        if (stableTaskResponse) {
            return this.finalizeAgentResponse(stableTaskResponse);
        }

        const routed = await this.tryLocalRoute(prompt);
        if (routed) {
            return this.finalizeAgentResponse(routed);
        }

        const intentRouted = await this.tryIntentRoute(prompt);
        if (intentRouted) {
            return this.finalizeAgentResponse(intentRouted);
        }

        const responseCacheKey = this.getResponseCacheKey(prompt);
        if (responseCacheKey) {
            const cachedReply = getCachedValue<string>(responseCacheKey);
            if (cachedReply) {
                return this.finalizeAgentResponse({
                steps: [{
                    thought: '命中低风险回复缓存',
                    reply: cachedReply,
                    path: 'cache',
                }],
                finalAnswer: cachedReply,
            });
            }
        }

        const intentDecision = classifyIntent(prompt);
        const steps: AgentStep[] = [];

        // 优化：如果本地意图分类能判断工具，先执行工具再一次性让 LLM 生成回答
        // 这样把 2 次 LLM 调用合并为 1 次，节省 5-7 秒
        if (intentDecision.useTool && intentDecision.confidence >= 0.5) {
            const toolObservation = await this.executeTool(intentDecision.useTool, { query: prompt });
            const preStep: AgentStep = {
                thought: `预执行工具：${intentDecision.useTool}`,
                action: { tool: intentDecision.useTool, input: { query: prompt } },
                observation: toolObservation,
                path: 'prefetch',
            };
            steps.push(preStep);
            this.pushHistory('tool', `${intentDecision.useTool}: ${toolObservation}`);
        }

        let currentStep = 0;
        const maxSteps = steps.length > 0 ? 2 : 5; // 已有工具结果时最多再调 2 轮

        while (currentStep < maxSteps) {
            const modelRoute = selectModelRoute(prompt, {
                intentDecision,
                historyLength: this.context.history.length,
                hasPendingWrite: Boolean(this.pendingWriteAction),
                hasPendingCourseAction: Boolean(this.pendingCourseAction),
                previousSteps: steps,
            });

            // Ask LLM for next step (if tool already executed, LLM will directly synthesize answer)
            const decision = await this.realDeepSeekCall(prompt, steps, modelRoute, onUpdate);
            steps.push(decision);

            if (!decision.action) {
                // No more actions, the LLM has provided the final answer
                break;
            }

            // Execute the Tool
            const observation = await this.executeTool(decision.action.tool, decision.action.input);
            decision.observation = observation;
            this.pushHistory('tool', `${decision.action.tool}: ${observation}`);

            currentStep++;
        }

        return this.finalizeAgentResponse({
            steps,
            finalAnswer: steps[steps.length - 1].reply || steps[steps.length - 1].thought,
        }, {
            responseCacheKey,
            shouldCacheDirectReply: Boolean(
                responseCacheKey
                && steps.length === 1
                && !steps[0].action
                && steps[0].reply
            ),
        });
    }

    private async tryLocalRoute(prompt: string): Promise<AgentResponse | null> {
        const publishIntent = detectCoursePublishIntent(prompt);
        if (publishIntent) {
            const response = await this.startCourseAction(prompt, publishIntent);
            return {
                steps: [{
                    thought: '本地命中课程社区发布请求',
                    reply: response,
                    path: 'local_rule',
                }],
                finalAnswer: response
            };
        }

        if (isDateQuery(prompt)) {
            const observation = this.readCurrentDateInfo(prompt);
            return {
                steps: [{
                    thought: '本地命中日期查询',
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        if (!isScheduleWriteIntent(prompt) && isScheduleQuery(prompt)) {
            const observation = await this.executeTool('read_user_schedule', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中课表查询',
                    action: {
                        tool: 'read_user_schedule',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        if (isScheduleWriteIntent(prompt)) {
            const response = await this.executeTool('write_user_schedule_entry', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中课程写入意图',
                    action: {
                        tool: 'write_user_schedule_entry',
                        input: { query: prompt }
                    },
                    observation: response,
                    reply: response,
                    path: 'local_rule',
                }],
                finalAnswer: response
            };
        }

        if (isCalendarEventWriteIntent(prompt)) {
            const response = await this.executeTool('create_user_calendar_event', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中日历事件写入意图',
                    action: {
                        tool: 'create_user_calendar_event',
                        input: { query: prompt }
                    },
                    observation: response,
                    reply: response,
                    path: 'local_rule',
                }],
                finalAnswer: response
            };
        }

        if (isNearbyPlaceQuery(prompt)) {
            const observation = await this.executeTool('find_nearby_place', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中附近地点查询',
                    action: {
                        tool: 'find_nearby_place',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        if (isBuildingInfoQuery(prompt)) {
            const observation = await this.executeTool('read_campus_building', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中建筑信息查询',
                    action: {
                        tool: 'read_campus_building',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        if (isCourseCommunityQuery(prompt)) {
            const observation = await this.executeTool('read_course_community', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中课程社区查询',
                    action: {
                        tool: 'read_course_community',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        if (isCampusFaqQuery(prompt)) {
            const observation = await this.executeTool('search_campus_faq', { query: prompt });
            return {
                steps: [{
                    thought: '本地命中校园 FAQ 查询',
                    action: {
                        tool: 'search_campus_faq',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation,
                    path: 'local_rule',
                }],
                finalAnswer: observation
            };
        }

        return null;
    }

    private async tryStableTaskRoute(prompt: string): Promise<AgentResponse | null> {
        const decision = inferStableTask(prompt);

        const hasCompositeIntent = /，|,|顺便|順便|另外|另外再|同时|同時|and also|also/i.test(prompt);

        if (decision.type === 'memory_write' && !hasCompositeIntent) {
            const reply = this.prepareMemoryWrite(decision.key, decision.value);
            return {
                steps: [{
                    thought: '命中稳定子任务：记忆写入',
                    reply,
                    routeReason: decision.reason,
                    path: 'stable_task',
                }],
                finalAnswer: reply,
            };
        }

        if (decision.type === 'memory_read' && !hasCompositeIntent) {
            const fact = await getMemoryFact(this.context.userId, decision.key);
            const keyLabels: Record<string, string> = {
                major: '专业',
                hall: '宿舍',
                favorite_food: '喜欢的食物',
                nickname: '称呼',
                language_preference: '语言偏好',
            };
            const reply = fact
                ? `我记得你的${keyLabels[decision.key] || decision.key}是：${String(fact)}。`
                : `我现在还没有记住你的${keyLabels[decision.key] || decision.key}。如果你愿意，我可以现在记下来。`;
            return {
                steps: [{
                    thought: '命中稳定子任务：记忆读取',
                    reply,
                    routeReason: decision.reason,
                    path: 'stable_task',
                }],
                finalAnswer: reply,
            };
        }

        if (decision.type === 'faq_lookup' && !hasCompositeIntent) {
            const observation = await this.executeTool('search_campus_faq', { query: decision.normalizedQuery });
            return {
                steps: [{
                    thought: `命中稳定子任务：FAQ 查询规范化 (${decision.topic})`,
                    routeReason: decision.reason,
                    action: {
                        tool: 'search_campus_faq',
                        input: { query: decision.normalizedQuery },
                    },
                    observation,
                    reply: observation,
                    path: 'stable_task',
                }],
                finalAnswer: observation,
            };
        }

        return null;
    }

    private async tryIntentRoute(prompt: string): Promise<AgentResponse | null> {
        const decision = classifyIntent(prompt);
        if (!decision.useLocalRoute || !decision.useTool || decision.confidence < 0.7) {
            return null;
        }

        const observation = await this.executeTool(decision.useTool, { query: prompt });
        return {
            steps: [{
                thought: `意图路由命中：${decision.intent}`,
                action: {
                    tool: decision.useTool,
                    input: { query: prompt }
                },
                observation,
                reply: observation,
                path: 'intent_route',
            }],
            finalAnswer: observation,
        };
    }

    private async continuePendingWriteAction(prompt: string): Promise<AgentResponse | null> {
        if (!this.pendingWriteAction) return null;

        const stableDecision = inferStableTask(prompt);
        const isCancelIntent =
            (stableDecision.type === 'write_confirmation' && stableDecision.intent === 'cancel')
            || isCancelActionQuery(prompt);
        const isConfirmIntent =
            (stableDecision.type === 'write_confirmation' && stableDecision.intent === 'confirm')
            || isConfirmActionQuery(prompt);

        if (isCancelIntent) {
            this.pendingWriteAction = null;
            this.pendingCourseAction = null;
            const reply = '已取消这次写入操作。你如果想改内容，直接重新告诉我，我会先给你确认稿。';
            return {
                steps: [{
                    thought: '用户取消待确认写入',
                    reply,
                    routeReason: stableDecision.reason,
                    path: 'pending',
                }],
                finalAnswer: reply,
            };
        }

        if (this.pendingWriteAction.type === 'schedule') {
            const parsedUpdate = parseScheduleWriteDraft(prompt);
            const hasStructuredUpdate = hasScheduleDraftUpdates(parsedUpdate);

            if (isConfirmIntent || (hasConfirmKeyword(prompt) && hasStructuredUpdate)) {
                const mergedDraft = hasStructuredUpdate
                    ? mergeScheduleDraft(this.pendingWriteAction.entry, parsedUpdate)
                    : this.pendingWriteAction.entry;
                this.pendingWriteAction = { type: 'schedule', entry: mergedDraft };

                const readyEntry = toScheduleEntry(mergedDraft);
                if (!readyEntry) {
                    const missingPrompt = formatMissingFieldsPrompt(getMissingScheduleFields(mergedDraft), 'schedule');
                    return {
                        steps: [{
                            thought: '待确认课表写入仍缺少必要字段',
                            reply: missingPrompt,
                            routeReason: stableDecision.reason,
                            path: 'pending',
                        }],
                        finalAnswer: missingPrompt,
                    };
                }

                const reply = await this.executePendingWriteAction();
                return {
                    steps: [{
                        thought: hasStructuredUpdate ? '用户确认并补充课表信息后执行写入' : '用户确认执行写入',
                        reply,
                        routeReason: stableDecision.reason,
                        path: 'pending',
                    }],
                    finalAnswer: reply,
                };
            }

            const response = await this.prepareScheduleWrite({
                ...this.pendingWriteAction.entry,
                query: prompt,
            });
            return {
                steps: [{
                    thought: '继续补全待确认的课表写入',
                    reply: response,
                    path: 'pending',
                }],
                finalAnswer: response,
            };
        }

        if (this.pendingWriteAction.type === 'calendar_event') {
            const parsedUpdate = parseCalendarEventDraft(prompt);
            const hasStructuredUpdate = hasCalendarEventDraftUpdates(parsedUpdate);

            if (isConfirmIntent || (hasConfirmKeyword(prompt) && hasStructuredUpdate)) {
                const mergedDraft = hasStructuredUpdate
                    ? mergeCalendarEventDraft(this.pendingWriteAction.event, parsedUpdate)
                    : this.pendingWriteAction.event;
                this.pendingWriteAction = { type: 'calendar_event', event: mergedDraft };

                const readyEvent = toCalendarEventInput(mergedDraft);
                if (!readyEvent) {
                    const missingPrompt = formatMissingFieldsPrompt(getMissingCalendarEventFields(mergedDraft), 'calendar_event');
                    return {
                        steps: [{
                            thought: '待确认日历写入仍缺少必要字段',
                            reply: missingPrompt,
                            routeReason: stableDecision.reason,
                            path: 'pending',
                        }],
                        finalAnswer: missingPrompt,
                    };
                }

                const reply = await this.executePendingWriteAction();
                return {
                    steps: [{
                        thought: hasStructuredUpdate ? '用户确认并补充日历信息后执行写入' : '用户确认执行写入',
                        reply,
                        routeReason: stableDecision.reason,
                        path: 'pending',
                    }],
                    finalAnswer: reply,
                };
            }

            const response = await this.prepareCalendarEventWrite({
                ...this.pendingWriteAction.event,
                query: prompt,
            });
            return {
                steps: [{
                    thought: '继续补全待确认的日历写入',
                    reply: response,
                    path: 'pending',
                }],
                finalAnswer: response,
            };
        }

        if (isConfirmIntent) {
            const reply = await this.executePendingWriteAction();
            return {
                steps: [{
                    thought: '用户确认执行写入',
                    reply,
                    routeReason: stableDecision.reason,
                    path: 'pending',
                }],
                finalAnswer: reply,
            };
        }

        if (this.pendingWriteAction.type === 'course') {
            const response = await this.startCourseAction(
                prompt,
                this.pendingWriteAction.action.intent,
                this.pendingWriteAction.action,
            );
            return {
                steps: [{
                    thought: '用户修改待确认内容',
                    reply: response,
                    path: 'pending',
                }],
                finalAnswer: response,
            };
        }

        this.pendingWriteAction = null;
        const reply = '这次偏好写入我先取消了。你直接告诉我想让我记住什么，我会先发确认内容给你。';
        return {
            steps: [{
                thought: '待确认记忆写入被改写',
                reply,
                path: 'pending',
            }],
            finalAnswer: reply,
        };
    }

    private async continuePendingCourseAction(prompt: string): Promise<AgentResponse | null> {
        if (!this.pendingCourseAction) return null;

        const stableDecision = inferStableTask(prompt);

        if (stableDecision.type === 'write_confirmation' && stableDecision.intent === 'cancel') {
            this.pendingCourseAction = null;
            return {
                steps: [{
                    thought: '用户取消了待发布操作',
                    reply: '已取消这次发布操作。你之后随时告诉我课程和内容，我再帮你发。',
                    routeReason: stableDecision.reason,
                    path: 'pending',
                }],
                finalAnswer: '已取消这次发布操作。你之后随时告诉我课程和内容，我再帮你发。'
            };
        }

        const response = await this.startCourseAction(prompt, this.pendingCourseAction.intent, this.pendingCourseAction);
        return {
            steps: [{
                thought: '继续补全课程社区发布信息',
                reply: response,
                path: 'pending',
            }],
            finalAnswer: response
        };
    }

    private async executeTool(toolName: string, input: any): Promise<string> {
        console.log(`[Agent] Executing tool: ${toolName}`, input);
        const startedAt = Date.now();

        try {
            if (toolName === 'read_course_community') {
                const routedPublishIntent = detectCoursePublishIntent(input?.query || '');
                if (routedPublishIntent) {
                    return this.startCourseAction(input?.query || '', routedPublishIntent, this.pendingCourseAction);
                }
            }

            // Real and Mock tool implementations
            switch (toolName) {
                case 'read_user_schedule':
                    return this.executeCachedReadonlyTool('read_user_schedule', { query: input?.query || '' }, () => this.readUserSchedule(input?.query || ''));
                case 'read_campus_building':
                    return this.executeCachedReadonlyTool('read_campus_building', { query: input?.query || '' }, () => this.readCampusBuilding(input?.query || ''));
                case 'find_nearby_place':
                    return this.executeCachedReadonlyTool(
                        'find_nearby_place',
                        {
                            query: input?.query || '',
                            latitude: this.context.deviceLocation?.latitude ?? 'none',
                            longitude: this.context.deviceLocation?.longitude ?? 'none',
                        },
                        () => this.findNearbyPlace(input?.query || '')
                    );
                case 'read_course_community':
                    return this.executeCachedReadonlyTool('read_course_community', { query: input?.query || '' }, () => this.readCourseCommunity(input?.query || ''));
                case 'post_course_review':
                    return this.startCourseAction(
                        `${input?.courseCode || input?.courseId || ''} ${input?.rating || ''}星 ${input?.content || ''}`.trim(),
                        'review'
                    );
                case 'post_course_teaming':
                    return this.startCourseAction(
                        `${input?.courseCode || input?.courseId || ''} section ${input?.section || ''} ${input?.content || ''}`.trim(),
                        'teaming'
                    );
                case 'send_course_chat_message':
                    return this.startCourseAction(
                        `${input?.courseCode || input?.courseId || ''} ${input?.content || ''}`.trim(),
                        'chat'
                    );
                case 'get_user_profile':
                    const facts = await getAllUserFacts(this.context.userId);
                    if (Object.keys(facts).length === 0) {
                        return JSON.stringify({ major: 'Computer Science', hall: 'Hall 1', status: 'First Time User' });
                    }
                    return JSON.stringify(facts);
                case 'save_user_preference':
                    return this.prepareMemoryWrite(input?.key, input?.value);
                case 'write_user_schedule_entry':
                    return this.prepareScheduleWrite(input);
                case 'create_user_calendar_event':
                    return this.prepareCalendarEventWrite(input);
                case 'search_canteen_menu':
                    return "Nearby Harmony Cafeteria has 'Spicy Chicken' on special today. It's only 5 mins from Hall 1.";
                case 'check_library_availability':
                case 'book_library_seat':
                    return '图书馆自动化预约功能已下线，当前助手仅提供问答服务。';
                case 'search_campus_faq':
                    return this.executeCachedReadonlyTool('search_campus_faq', { query: input?.query || '' }, () => this.readCampusFaq(input?.query || ''));
                default:
                    return `Error: Tool ${toolName} not found.`;
            }
        } finally {
            console.log(`[Agent] Tool completed: ${toolName} (${Date.now() - startedAt}ms)`);
        }
    }

    private async executeCachedReadonlyTool(
        toolName: keyof typeof AgentExecutor.CACHE_TTLS,
        payload: Record<string, unknown>,
        loader: () => Promise<string>
    ): Promise<string> {
        const cacheKey = buildToolCacheKey(toolName, payload, {
            userId: toolName === 'read_user_schedule' ? this.context.userId : undefined,
            version: 'phase2_v1',
        });

        return getOrSetCachedValue(cacheKey, AgentExecutor.CACHE_TTLS[toolName], loader);
    }

    private getResponseCacheKey(prompt: string): string | null {
        if (!isLowRiskResponseCacheable(prompt, this.context.history.length)) {
            return null;
        }

        return buildResponseCacheKey(
            { prompt },
            { model: resolveModelName('fast'), version: 'phase2_v1' }
        );
    }

    private prepareMemoryWrite(key?: string, value?: any): string {
        const normalizedKey = typeof key === 'string' ? key.trim() : '';
        const normalizedValue = typeof value === 'string' ? value.trim() : value;

        if (!normalizedKey || normalizedValue === undefined || normalizedValue === null || normalizedValue === '') {
            return '我还不能写入这条记忆，因为键或内容不完整。你可以直接告诉我你想让我记住什么。';
        }

        this.pendingCourseAction = null;
        this.pendingWriteAction = {
            type: 'memory',
            key: normalizedKey,
            value: normalizedValue,
        };

        return `我准备记住这条信息：${normalizedKey} = ${String(normalizedValue)}。\n如果就是这样写，回复“确认”或“是”；如果要改，直接把新内容发我。`;
    }

    private async startCourseAction(
        prompt: string,
        intent: CoursePublishIntent,
        seed?: PendingCourseAction | null
    ): Promise<string> {
        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            this.pendingCourseAction = null;
            return '要帮你发内容的话需要先登录。你登录后再告诉我一次，我可以继续帮你处理。';
        }

        const merged = await this.mergeCourseActionDraft(prompt, intent, seed || undefined);
        return this.handleCourseActionDraft(merged, currentUser);
    }

    private async mergeCourseActionDraft(
        prompt: string,
        intent: CoursePublishIntent,
        seed?: PendingCourseAction
    ): Promise<PendingCourseAction> {
        const draft: PendingCourseAction = {
            intent,
            course: seed?.course || null,
            courseQuery: seed?.courseQuery,
            content: seed?.content,
            rating: seed?.rating,
            section: seed?.section,
            targetTeammate: seed?.targetTeammate,
            contacts: seed?.contacts ? [...seed.contacts] : [],
        };

        const safePrompt = isAgentMetaQuery(prompt) ? '' : prompt;

        const directCourse = await this.resolveCourseForAction(safePrompt);
        if (directCourse) {
            draft.course = directCourse;
            draft.courseQuery = directCourse.code;
        } else if (!draft.course) {
            const historyCourse = await this.resolveCourseFromRecentContext();
            if (historyCourse) {
                draft.course = historyCourse;
                draft.courseQuery = historyCourse.code;
            }
        }

        const rating = extractRating(safePrompt);
        if (typeof rating === 'number') {
            draft.rating = rating;
        }

        const section = extractSection(safePrompt);
        if (section) {
            draft.section = section;
        }

        const targetTeammate = extractTargetTeammate(safePrompt);
        if (targetTeammate) {
            draft.targetTeammate = targetTeammate;
        }

        const mergedContacts = extractContacts(safePrompt, undefined);
        if (mergedContacts.length > 0) {
            const contactMap = new Map<string, ContactMethod>();
            [...(draft.contacts || []), ...mergedContacts].forEach(contact => {
                contactMap.set(`${contact.platform}:${contact.value}`, contact);
            });
            draft.contacts = Array.from(contactMap.values());
        }

        const content = extractFreeformContent(safePrompt);
        if (content && !looksLikeStandaloneCourseReply(safePrompt)) {
            draft.content = section
                ? content.replace(/^section\s*[A-Za-z0-9_-]+[\s，,:：-]*/i, '').trim()
                : content;
        }

        return draft;
    }

    private async resolveCourseForAction(query: string): Promise<Course | null> {
        const explicitCode = extractCourseCode(query);
        if (explicitCode) {
            return this.resolveCourseFromQuery(explicitCode);
        }

        if (/这门课|這門課|这堂课|這堂課/.test(query)) {
            return this.resolveCourseFromRecentContext();
        }

        return null;
    }

    private async resolveCourseFromRecentContext(): Promise<Course | null> {
        const stateCourse = this.context.sessionState.referencedCourse;
        if (stateCourse) {
            const resolved = await this.resolveCourseFromQuery(stateCourse);
            if (resolved) return resolved;
        }

        const recent = [...this.context.history]
            .slice(-10)
            .reverse()
            .filter(item => item.role === 'user')
            .map(item => item.content);

        for (const content of recent) {
            const code = extractCourseCode(content);
            if (!code) continue;
            const course = await this.resolveCourseFromQuery(code);
            if (course) return course;
        }

        return null;
    }

    private rememberPendingCourseAction(action: PendingCourseAction) {
        this.pendingCourseAction = action;
        this.pendingWriteAction = null;
    }

    private clearPendingCourseAction() {
        this.pendingCourseAction = null;
    }

    private formatCourseActionConfirmation(action: PendingCourseAction): string {
        const courseLabel = action.course?.code || action.courseQuery || '这门课';

        if (action.intent === 'chat') {
            return `我准备发到 ${courseLabel} 聊天室的内容是：\n${action.content?.trim() || ''}\n\n如果就是这样发，回复“确认”或“是”；如果要改，直接把新内容发我。`;
        }

        if (action.intent === 'review') {
            return `我准备发布到 ${courseLabel} 的评价是：\n评分：${action.rating} 星\n内容：${action.content?.trim() || ''}\n\n如果就是这样写，回复“确认”或“是”；如果要改，直接把新内容发我。`;
        }

        const contactText = (action.contacts || [])
            .map((contact) => `${contact.platform}: ${contact.value}`)
            .join('；');

        return `我准备发布 ${courseLabel} 组队帖：\nsection：${action.section}\n内容：${action.content?.trim() || ''}${action.targetTeammate ? `\n目标队友：${action.targetTeammate}` : ''}${contactText ? `\n联系方式：${contactText}` : ''}\n\n如果就是这样发，回复“确认”或“是”；如果要改，直接把新内容发我。`;
    }

    private async executePendingWriteAction(): Promise<string> {
        const pending = this.pendingWriteAction;
        this.pendingWriteAction = null;

        if (!pending) {
            return '当前没有待确认的写入操作。';
        }

        if (pending.type === 'memory') {
            await saveMemoryFact(this.context.userId, pending.key, pending.value);
            return `已经记住：${pending.key} = ${String(pending.value)}。`;
        }

        if (pending.type === 'schedule') {
            const entry = toScheduleEntry(pending.entry);
            if (!entry) {
                this.pendingWriteAction = pending;
                return formatMissingFieldsPrompt(getMissingScheduleFields(pending.entry), 'schedule');
            }
            return this.executeScheduleWrite(entry);
        }

        if (pending.type === 'calendar_event') {
            const event = toCalendarEventInput(pending.event);
            if (!event) {
                this.pendingWriteAction = pending;
                return formatMissingFieldsPrompt(getMissingCalendarEventFields(pending.event), 'calendar_event');
            }
            return this.executeCalendarEventWrite(event);
        }

        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            return '要执行这次写入需要先登录。';
        }

        this.clearPendingCourseAction();
        return this.executeCourseAction(pending.action, currentUser);
    }

    private async executeCourseAction(action: PendingCourseAction, currentUser: any): Promise<string> {
        if (action.intent === 'chat' && action.course && action.content) {
            return this.sendCourseChatMessage(action.course, currentUser, action.content);
        }

        if (action.intent === 'review' && action.course && typeof action.rating === 'number' && action.content) {
            return this.publishCourseReview(action.course, currentUser, action.rating, action.content);
        }

        if (action.intent === 'teaming' && action.course && action.section && action.content && action.contacts?.length) {
            return this.publishTeamingPost(action.course, currentUser, {
                section: action.section,
                content: action.content,
                targetTeammate: action.targetTeammate,
                contacts: action.contacts,
            });
        }

        return '这次写入信息还不完整，我先没有提交。你把缺的内容继续发我，我会重新生成确认稿。';
    }

    // ============== Schedule & Calendar Event Write Methods ==============

    private async prepareScheduleWrite(input: any): Promise<string> {
        if ((input?.query && typeof input.query === 'string') || this.pendingWriteAction?.type === 'schedule') {
            const currentUser = await getCurrentUser();
            if (!currentUser?.uid) {
                return '要帮你写进课表的话需要先登录。你登录后再告诉我一次，我就继续帮你处理。';
            }

            const parsedFromQuery = typeof input?.query === 'string' ? parseScheduleWriteDraft(input.query) : {};
            const draft = mergeScheduleDraft(
                {
                    title: input?.title?.trim() || undefined,
                    courseCode: input?.courseCode?.trim() || undefined,
                    teacherName: input?.teacherName?.trim() || undefined,
                    room: input?.room?.trim() || undefined,
                    dayOfWeek: input?.dayOfWeek,
                    startTime: input?.startTime || undefined,
                    endTime: input?.endTime || undefined,
                    startPeriod: input?.startPeriod || undefined,
                    endPeriod: input?.endPeriod || undefined,
                    weekText: input?.weekText?.trim() || undefined,
                },
                parsedFromQuery,
            );

            const missing = getMissingScheduleFields(draft);
            this.pendingWriteAction = { type: 'schedule', entry: draft };

            if (missing.length > 0) {
                return formatMissingFieldsPrompt(missing, 'schedule');
            }

            const entry = toScheduleEntry(draft);
            if (!entry) {
                return formatMissingFieldsPrompt(getMissingScheduleFields(draft), 'schedule');
            }

            const dayLabel = WEEKDAY_LABELS[entry.dayOfWeek];
            const timeText = entry.startTime && entry.endTime
                ? `${entry.startTime} - ${entry.endTime}`
                : `第${entry.startPeriod}-${entry.endPeriod} 节`;
            const courseCodeText = entry.courseCode ? ` (${entry.courseCode})` : '';

            return `我准备把以下课程写入你的课表：\n\n${entry.title}${courseCodeText}\n${dayLabel} ${timeText}${entry.room ? ` @ ${entry.room}` : ''}\n\n如果确认无误，回复“确认”或“是”；如果要修改，直接把新信息发我。`;
        }

        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            return '要帮你写入课表的话需要先登录。你登录后再告诉我一次，我可以继续帮你处理。';
        }

        // Validate required fields
        const title = input?.title?.trim();
        const dayOfWeek = input?.dayOfWeek;
        
        if (!title) {
            return '请告诉我课程名称，比如 "Data Communications"。';
        }
        
        if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
            return '请告诉我星期几，比如 "周二" 或 "星期三"。';
        }

        // Must have either time or period
        const hasTime = input?.startTime && input?.endTime;
        const hasPeriod = input?.startPeriod && input?.endPeriod;
        
        if (!hasTime && !hasPeriod) {
            return '请告诉我课程时间，可以是具体时间段（如 09:00-10:30）或节次（如第 3-4 节）。';
        }

        const entry = {
            title,
            courseCode: input?.courseCode?.trim() || undefined,
            teacherName: undefined,
            room: input?.room?.trim() || undefined,
            dayOfWeek,
            startTime: input?.startTime || undefined,
            endTime: input?.endTime || undefined,
            startPeriod: input?.startPeriod || undefined,
            endPeriod: input?.endPeriod || undefined,
            weekText: input?.weekText?.trim() || '1-16',
            matchedCourseId: undefined,
        };

        const dayLabel = WEEKDAY_LABELS[dayOfWeek];
        const timeText = hasTime 
            ? `${input.startTime} - ${input.endTime}`
            : `第 ${input.startPeriod}-${input.endPeriod} 节`;
        const courseCodeText = entry.courseCode ? ` (${entry.courseCode})` : '';
        
        this.pendingWriteAction = { type: 'schedule', entry };
        
        return `我准备把以下课程写入你的课表：\n\n${title}${courseCodeText}\n${dayLabel} ${timeText}${entry.room ? ` @ ${entry.room}` : ''}\n\n如果确认无误，回复"确认"或"是"；如果要修改，请告诉我新的信息。`;
    }

    private async executeScheduleWrite(entry: Omit<UserScheduleEntry, 'id' | 'userId' | 'source'>): Promise<string> {
        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            return '要执行这次写入需要先登录。';
        }

        try {
            await createManualScheduleEntry({
                userId: currentUser.uid,
                entry: {
                    title: entry.title,
                    courseCode: entry.courseCode,
                    teacherName: entry.teacherName,
                    room: entry.room,
                    dayOfWeek: entry.dayOfWeek,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                    startPeriod: entry.startPeriod,
                    endPeriod: entry.endPeriod,
                    weekText: entry.weekText,
                },
            });
            
            return `已成功将 "${entry.title}" 添加到你的课表！`;
        } catch (error) {
            console.error('Error writing schedule entry:', error);
            return '抱歉，写入课表时出现了问题。请稍后再试。';
        }
    }

    private async prepareCalendarEventWrite(input: any): Promise<string> {
        if ((input?.query && typeof input.query === 'string') || this.pendingWriteAction?.type === 'calendar_event') {
            const currentUser = await getCurrentUser();
            if (!currentUser?.uid) {
                return '要帮你写进日历的话需要先登录。你登录后再告诉我一次，我就继续帮你处理。';
            }

            const parsedFromQuery = typeof input?.query === 'string' ? parseCalendarEventDraft(input.query) : {};
            const draft = mergeCalendarEventDraft(
                {
                    title: input?.title?.trim() || undefined,
                    eventType: input?.eventType,
                    courseCode: input?.courseCode?.trim() || undefined,
                    matchedCourseId: input?.matchedCourseId,
                    eventDate: input?.eventDate,
                    startTime: input?.startTime || undefined,
                    endTime: input?.endTime || undefined,
                    location: input?.location?.trim() || undefined,
                    note: input?.note?.trim() || undefined,
                },
                parsedFromQuery,
            );

            const missing = getMissingCalendarEventFields(draft);
            this.pendingWriteAction = { type: 'calendar_event', event: draft };

            if (missing.length > 0) {
                return formatMissingFieldsPrompt(missing, 'calendar_event');
            }

            const event = toCalendarEventInput(draft);
            if (!event) {
                return formatMissingFieldsPrompt(getMissingCalendarEventFields(draft), 'calendar_event');
            }

            const timeText = event.startTime
                ? ` ${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
                : '';
            const locationText = event.location ? ` @ ${event.location}` : '';
            const courseText = event.courseCode ? ` (${event.courseCode})` : '';
            const eventTypeLabel = CALENDAR_EVENT_TYPE_LABELS[event.eventType];

            // 面向用户的确认信息，简洁明了
            let confirmationText = `我准备在你的日历里记录这条${eventTypeLabel}：\n\n${event.title}${courseText}\n${event.eventDate}${timeText}${locationText}`;
            
            // 时间和地点是可选的，如果没有提供，提醒用户可以补充
            if (!event.startTime || !event.location) {
                confirmationText += `\n\n（如需补充具体时间或地点，直接告诉我；如确认无误，回复"确认"或"是"）`;
            } else {
                confirmationText += `\n\n如果确认无误，回复"确认"或"是"；如果要修改，直接把新信息发我。`;
            }
            
            return confirmationText;
        }

        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            return '要帮你记录考试/事件的话需要先登录。你登录后再告诉我一次，我可以继续帮你处理。';
        }

        // Validate required fields
        const title = input?.title?.trim();
        const eventType = input?.eventType;
        const eventDate = input?.eventDate;
        
        if (!title) {
            return '请告诉我事件名称，比如 "COMP3015 Final Exam"。';
        }
        
        if (!eventType || !['exam', 'quiz', 'assignment', 'custom'].includes(eventType)) {
            return '请告诉我事件类型：exam（考试）、quiz（测验）、assignment（作业）或 custom（其他）。';
        }

        if (!eventDate) {
            return '请告诉我日期，格式为 YYYY-MM-DD，比如 "2026-05-15"。';
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(eventDate)) {
            return '日期格式不正确，请使用 YYYY-MM-DD 格式，比如 "2026-05-15"。';
        }

        const event: Omit<CreateUserCalendarEventInput, 'userId'> = {
            title,
            eventType,
            eventDate,
            courseCode: input?.courseCode?.trim() || undefined,
            startTime: input?.startTime || undefined,
            endTime: input?.endTime || undefined,
            location: input?.location?.trim() || undefined,
            note: input?.note?.trim() || undefined,
        };

        const typeLabels: Record<string, string> = {
            exam: '考试',
            quiz: '测验',
            assignment: '作业',
            custom: '事件',
        };

        const timeText = event.startTime 
            ? ` ${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
            : '';
        const locationText = event.location ? ` @ ${event.location}` : '';
        const courseText = event.courseCode ? ` (${event.courseCode})` : '';
        
        this.pendingWriteAction = { type: 'calendar_event', event };
        
        // 面向用户的确认信息
        let confirmationText = `我准备在你的日历中记录以下${typeLabels[eventType]}：\n\n${title}${courseText}\n${eventDate}${timeText}${locationText}`;
        
        // 时间和地点是可选的，如果没有提供，提醒可以补充
        if (!event.startTime || !event.location) {
            confirmationText += `\n\n（如需补充具体时间或地点，直接告诉我；如确认无误，回复"确认"或"是"）`;
        } else {
            confirmationText += `\n\n如果确认无误，回复"确认"或"是"；如果要修改，请告诉我新的信息。`;
        }
        
        return confirmationText;
    }

    private async executeCalendarEventWrite(event: Omit<CreateUserCalendarEventInput, 'userId'>): Promise<string> {
        const currentUser = await getCurrentUser();
        if (!currentUser?.uid) {
            return '要执行这次写入需要先登录。';
        }

        const { data, error } = await createUserCalendarEvent({
            userId: currentUser.uid,
            title: event.title,
            eventType: event.eventType as CalendarEventType,
            eventDate: event.eventDate,
            courseCode: event.courseCode,
            startTime: event.startTime,
            endTime: event.endTime,
            location: event.location,
            note: event.note,
        });

        if (error) {
            if (error.includes('already exists')) {
                return '这个事件已经存在于你的日历中了，不需要重复添加。';
            }
            console.error('Error creating calendar event:', error);
            return '抱歉，记录事件时出现了问题。请稍后再试。';
        }

        return `已成功记录 "${event.title}" 到你的日历！`;
    }

    private async handleCourseActionDraft(action: PendingCourseAction, currentUser: any): Promise<string> {
        const courseLabel = action.course?.code || action.courseQuery || '这门课';

        if (!action.course) {
            this.rememberPendingCourseAction(action);
            if (action.intent === 'teaming') {
                return '我先帮你接着看组队这件事。前面的上下文里我还没定位到具体课程，你把课程代码发我一下，比如 COMP3015，我再继续帮你往下发。';
            }

            if (action.intent === 'review') {
                return '我可以直接帮你发评价，不过我先得知道是哪个课程。把课程代码发我一下，比如 COMP2016。';
            }

            return '我可以帮你把话发到课程聊天室，不过前面的上下文里还没有明确课程。你把课程代码发我一下，比如 COMP3015。';
        }

        if (action.intent === 'chat') {
            if (!action.content) {
                this.rememberPendingCourseAction(action);
                return `收到，是 ${courseLabel}。你想发到聊天室的内容直接发我一句完整的话，我帮你接着发出去。`;
            }

            this.clearPendingCourseAction();
            this.pendingWriteAction = { type: 'course', action };
            return this.formatCourseActionConfirmation(action);
        }

        if (action.intent === 'review') {
            if (typeof action.rating !== 'number' || !action.content) {
                this.rememberPendingCourseAction(action);
                if (typeof action.rating !== 'number' && !action.content) {
                    return `收到，是 ${courseLabel}。你把评分和想写的评价一起发我就行，比如“4星，作业不少，但老师讲得很清楚”。`;
                }

                if (typeof action.rating !== 'number') {
                    return `收到，是 ${courseLabel}，评价内容我先记下了。再给我一个 1 到 5 星的评分，我就帮你发出去。`;
                }

                return `收到，是 ${courseLabel}，${action.rating} 星我也记下了。再把你想发的评价正文给我，我就继续。`;
            }

            this.clearPendingCourseAction();
            this.pendingWriteAction = { type: 'course', action };
            return this.formatCourseActionConfirmation(action);
        }

        const fallbackEmail = currentUser.email || undefined;
        const contacts = (action.contacts && action.contacts.length > 0)
            ? action.contacts
            : extractContacts('', fallbackEmail);

        if (!action.section || !action.content) {
            this.rememberPendingCourseAction({ ...action, contacts });
            if (!action.section && !action.content) {
                return `收到，是 ${courseLabel}。下一步把你的 section 和想发的组队内容告诉我就行，比如“section A1，我会前端，想找认真做 project 的队友”。`;
            }
            if (!action.section) {
                return `收到，${courseLabel} 的组队内容我先记下了。再给我你的 section，比如 A1 或 B2，我就继续帮你发。`;
            }
            return `收到，你是 ${courseLabel} 的 ${action.section}。再把你想发的组队内容直接发我，我就继续。`;
        }

        if (!contacts.length) {
            this.rememberPendingCourseAction(action);
            return `内容和课程我都记下了。最后还差一个联系方式，比如“微信 tim123”或“email me@hkbu.edu.hk”，我拿到后就帮你发。`;
        }

        this.clearPendingCourseAction();
        this.pendingWriteAction = {
            type: 'course',
            action: {
                ...action,
                contacts,
            },
        };
        return this.formatCourseActionConfirmation({
            ...action,
            contacts,
        });
    }

    private async sendCourseChatMessage(course: Course, currentUser: any, content: string): Promise<string> {
        const courseIds = await buildCourseCommunityIdCandidates(course, course.code);
        const targetCourseId = courseIds[0] || course.id;

        const { error } = await supabase
            .from('messages')
            .insert({
                course_id: targetCourseId,
                sender_id: currentUser.uid,
                content: content.trim(),
            });

        if (error) {
            console.error('[Agent] Failed to send course chat message:', error);
            return `我没能把消息发到 ${course.code} 聊天室，数据库返回的是：${error.message}。`;
        }

        return `已经帮你发到 ${course.code} 聊天室：${content.trim()}`;
    }

    private async publishCourseReview(course: Course, currentUser: any, rating: number, content: string): Promise<string> {
        const { error } = await addReview({
            courseId: course.id,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || 'Anonymous',
            authorAvatar: currentUser.avatarUrl || currentUser.photoURL || '👤',
            rating,
            difficulty: 3,
            content: content.trim(),
            semester: 'Current',
            isAnonymous: false,
        });

        if (error) {
            console.error('[Agent] Failed to post course review:', error);
            return `我没能把评价发到 ${course.code}，数据库返回的是：${error.message || '未知错误'}。`;
        }

        return `已经帮你把这条 ${rating} 星评价发到 ${course.code}：${content.trim()}`;
    }

    private async publishTeamingPost(
        course: Course,
        currentUser: any,
        input: { section: string; content: string; targetTeammate?: string; contacts: ContactMethod[] }
    ): Promise<string> {
        const result = await postTeamingRequest({
            courseId: course.id,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Anonymous',
            userAvatar: currentUser.avatarUrl || currentUser.photoURL || '👤',
            userMajor: currentUser.major || 'Student',
            section: input.section,
            selfIntro: input.content.trim(),
            targetTeammate: input.targetTeammate,
            contacts: input.contacts,
        });

        if (!result.success) {
            return `我没能帮你发 ${course.code} 的组队帖，数据库返回的是：${result.error || '未知错误'}。`;
        }

        return `已经帮你发出 ${course.code} 的组队帖，section ${input.section}。如果你还想补充目标队友要求或改内容，直接继续跟我说。`;
    }

    private async readUserSchedule(query: string): Promise<string> {
        try {
            const entries = await getUserScheduleEntries(this.context.userId, { allowStaleOnError: true });
            if (entries.length === 0) {
                return '你的个人课表里还没有课程。你可以先去 Profile 里的 My Schedule 导入或手动添加。';
            }

            const parsed = parseScheduleQuery(query);
            const sortedEntries = [...entries].sort((a, b) => {
                if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
                return getEntrySortValue(a) - getEntrySortValue(b);
            });

            if (parsed.intent === 'next') {
                const now = getHongKongNow();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const todayEntries = sortedEntries.filter(entry => entry.dayOfWeek === parsed.dayOfWeek);
                const nextEntry = todayEntries.find(entry => {
                    const startMinutes = getEntryStartMinutes(entry);
                    return startMinutes !== null && startMinutes >= currentMinutes;
                });

                if (nextEntry) {
                    return `你下一节课是：${formatScheduleEntry(nextEntry)}。`;
                }

                return '你今天后面没有更多课了。';
            }

            if (parsed.intent === 'today' || parsed.intent === 'tomorrow' || parsed.intent === 'weekday') {
                const dayOfWeek = parsed.dayOfWeek || getHongKongDayOfWeek();
                const dayEntries = sortedEntries.filter(entry => entry.dayOfWeek === dayOfWeek);
                const label = parsed.intent === 'today'
                    ? '你今天'
                    : parsed.intent === 'tomorrow'
                        ? '你明天'
                        : `${WEEKDAY_LABELS[dayOfWeek]}`;
                return formatScheduleSummary(dayEntries, label);
            }

            const grouped = Object.entries(
                sortedEntries.reduce<Record<string, UserScheduleEntry[]>>((acc, entry) => {
                    const key = WEEKDAY_LABELS[entry.dayOfWeek] || `周${entry.dayOfWeek}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry);
                    return acc;
                }, {})
            ).map(([label, dayEntries]) => formatScheduleSummary(dayEntries, label));

            return `这是你当前课表概览：\n\n${grouped.join('\n\n')}`;
        } catch (error) {
            console.error('[Agent] Failed to read user schedule:', error);
            return '我暂时没法读取你的课表，可能是登录状态或数据库访问出了问题。';
        }
    }

    private async readCampusBuilding(query: string): Promise<string> {
        try {
            return await formatBuildingInfo(query);
        } catch (error) {
            console.error('[Agent] Failed to read campus building:', error);
            return '我暂时没法读取这栋楼的信息，请稍后再试。';
        }
    }

    private readCurrentDateInfo(query: string): string {
        const isTomorrow = /明天|tomorrow/i.test(query);
        const now = getHongKongNow();
        if (isTomorrow) {
            now.setDate(now.getDate() + 1);
        }

        const day = now.getDay() === 0 ? 7 : now.getDay();
        const label = getDayLabel(day);
        const dateText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return isTomorrow
            ? `明天是 ${label}，日期是 ${dateText}。`
            : `今天是 ${label}，日期是 ${dateText}。`;
    }

    private async findNearbyPlace(query: string): Promise<string> {
        try {
            return await formatNearbyPlaceInfo(query, this.context.deviceLocation);
        } catch (error) {
            console.error('[Agent] Failed to find nearby place:', error);
            return '我暂时没法根据你的位置找附近地点，请稍后再试。';
        }
    }

    private async resolveCourseFromQuery(query: string): Promise<Course | null> {
        const code = extractCourseCode(query);
        if (code) {
            const exact = await getCourseByCode(code);
            if (exact) return exact;

            // If the user provided an explicit course code, trust that signal first.
            // Do not fall through to fuzzy text search like "在聊啥", which can match unrelated courses.
            return {
                id: code,
                code,
                name: code,
                instructor: '',
                department: '',
                credits: 0,
                rating: 0,
                reviewCount: 0,
            };
        }

        const searchTerm = extractCourseSearchTerm(query) || code || query.trim();
        if (!searchTerm) return null;

        const results = await searchCourses(searchTerm, 5);
        if (results.length === 0) return null;

        if (code) {
            const matched = results.find(course => course.code?.toUpperCase().replace(/\s+/g, '') === code);
            if (matched) return matched;
        }

        return results[0];
    }

    private async readCourseCommunity(query: string): Promise<string> {
        try {
            const course = await this.resolveCourseFromQuery(query);
            if (!course) {
                return '我没定位到你说的是哪门课。请尽量带上课程代码，比如 COMP3015。';
            }

            const scope = detectCourseCommunityScope(query);
            const courseIds = await buildCourseCommunityIdCandidates(course, query);

            if (scope === 'reviews') {
                const reviews = await getReviews(course.id, course.code);
                return formatReviewSummary(reviews, course);
            }

            if (scope === 'chat') {
                const { data, error } = await supabase
                    .from('messages')
                    .select('content, sender_id, users(display_name)')
                    .in('course_id', courseIds)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error('[Agent] Failed to read course chat:', error);
                    return `我暂时没法读取 ${course.code} 的聊天室。`;
                }

                return formatChatSummary(data || [], course);
            }

            if (scope === 'teaming') {
                const requests = await fetchTeamingRequests(course.id);
                return formatTeamingSummary(requests, course);
            }

            const [reviews, messagesResult, requests] = await Promise.all([
                getReviews(course.id, course.code),
                supabase
                    .from('messages')
                    .select('content, sender_id, users(display_name)')
                    .in('course_id', courseIds)
                    .order('created_at', { ascending: true }),
                fetchTeamingRequests(course.id),
            ]);

            const chatText = messagesResult.error
                ? `${course.code} 聊天室暂时读取失败。`
                : formatChatSummary(messagesResult.data || [], course);

            return [
                `${course.code} ${course.name} 的社区概况：`,
                formatReviewSummary(reviews, course),
                chatText,
                formatTeamingSummary(requests, course),
            ].join('\n\n');
        } catch (error) {
            console.error('[Agent] Failed to read course community:', error);
            return '我暂时没法读取这门课的评价、聊天室或 teaming 信息。';
        }
    }

    private async readCampusFaq(query: string): Promise<string> {
        try {
            const localResults = FAQService.searchFAQs(query);
            const kbResults = await FAQService.searchKnowledgeBase(query);
            return FAQService.buildCampusFaqAnswer(query, localResults, kbResults);
        } catch (error) {
            console.error('[Agent] Failed to read campus FAQ:', error);
            return '我暂时没法读取校园 FAQ 或知识库内容，请稍后再试。';
        }
    }

    private async realDeepSeekCall(
        prompt: string,
        previousSteps: AgentStep[],
        modelRoute: ReturnType<typeof selectModelRoute>,
        onUpdate?: (text: string) => void
    ): Promise<AgentStep> {
        const modelName = resolveModelName(modelRoute.tier);
        const systemPrompt = `你是 HKCampus Assistant，仅处理 HKBU 校园生活、学业、校园设施、学生服务与 HKCampus app 相关问题。

规则：
1. 不要编造事实；不确定就用工具。
2. 用户问个人课表/下一节课/某天课程，必须用 read_user_schedule。
3. 用户问课程评价、聊天室、组队情况，必须用 read_course_community。
4. 用户要发布课程评价、组队帖、聊天室消息，信息足够时必须调用对应工具；课程不明确时先追问课程代码。
5. 用户问建筑位置或建筑简称，必须用 read_campus_building。
6. 用户问附近地点、最近建筑、最近餐厅、当前位置，必须用 find_nearby_place。
7. 用户问校园 FAQ、学生手册、图书馆、GPA、校历、住宿、IT 服务、学费等问题，优先用 search_campus_faq。
8. 若问题明显与 HKBU/校园生活无关，礼貌拒绝并引回校园话题。

可用工具：
${JSON.stringify(TOOLS)}

输出要求：
1. 需要用工具时，只输出 JSON：{"thought":"简短判断","action":{"tool":"tool_name","input":{}}}
2. 可以直接回答时，只输出 JSON：{"reply":"中文回答"}
3. 不要输出额外解释，不要输出 Markdown 代码块。

上下文：
Recent conversation:
${this.getRecentConversationContext()}
User Prompt: ${prompt}
Progress so far: ${JSON.stringify(previousSteps)}
Model route:
- tier: ${modelRoute.tier}
- reason: ${modelRoute.reason}
- complexity: ${modelRoute.complexity}
- directResponsePreferred: ${modelRoute.directResponsePreferred}`;

        try {
            const llmOutput = await callDeepSeekStream([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ], (currentJsonStr) => {
                if (onUpdate) {
                    const match = currentJsonStr.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
                    if (match) {
                        try {
                            // Safely unescape the partial JSON string
                            let unescaped = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            onUpdate(unescaped);
                        } catch (e) { }
                    }
                }
            }, { model: modelName });

            // Clean up potentially backticked JSON
            const jsonStr = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);

            return {
                thought: result.thought,
                reply: result.reply,
                action: result.action,
                modelTier: modelRoute.tier,
                modelName,
                routeReason: modelRoute.reason,
                path: 'llm',
            };
        } catch (e) {
            console.error('[Agent] Real LLM call failed, falling back to basic mock.', e);
            return {
                thought: "抱歉，由于网络或 API 问题，我暂时无法进行深度推理。请稍后再试。",
                modelTier: modelRoute.tier,
                modelName,
                routeReason: modelRoute.reason,
                path: 'llm',
            };
        }
    }
}

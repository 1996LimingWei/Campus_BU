import { FAQService } from '../faq';
import { getCourseByCode, getReviews, searchCourses, addReview } from '../courses';
import { supabase } from '../supabase';
import { fetchTeamingRequests, postTeamingRequest } from '../teaming';
import { getUserScheduleEntries, UserScheduleEntry } from '../schedule';
import { getCurrentUser } from '../auth';
import {
    formatBuildingInfo,
    formatNearbyPlaceInfo,
    isBuildingInfoQuery,
    isNearbyPlaceQuery,
} from './campus_queries';
// import { CozeService } from './coze';
import { callDeepSeekStream } from './llm';
import { getAllUserFacts, saveMemoryFact } from './memory';
import { TOOLS } from './tools';
import { AgentContext, AgentGeoPoint, AgentResponse, AgentStep } from './types';
import { ContactMethod, Course, CourseTeaming, Review } from '../../types';

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

type PendingWriteAction =
    | {
        type: 'course';
        action: PendingCourseAction;
    }
    | {
        type: 'memory';
        key: string;
        value: any;
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

const isCourseCommunityQuery = (query: string): boolean => {
    const hasCourseIdentity = Boolean(extractCourseCode(query)) || /这门课|這門課|这堂课|這堂課|课程|課程/.test(query);
    const hasCommunityIntent = /评价|評價|点评|點評|review|reviews|聊天室|群聊|chatroom|chat|message|teaming|组队|組隊|队友|隊友|口碑|怎么样|怎麼樣|如何|值得上吗|值得上嗎|好不好|活跃吗|活躍嗎/.test(query);
    return hasCommunityIntent && hasCourseIdentity;
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
    /取消|算了|不用了|先不用|停止|cancel|never mind/i.test(query.trim());

const isConfirmActionQuery = (query: string): boolean =>
    /^(是|好的|好|确认|確認|可以|就这样|就這樣|没问题|沒問題|yes|ok|okay|confirm|send|发送|發送)$/i.test(query.trim());

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
    private static readonly MAX_HISTORY_ITEMS = 16;
    private pendingCourseAction: PendingCourseAction | null = null;
    private pendingWriteAction: PendingWriteAction | null = null;

    constructor(userId: string) {
        this.context = {
            userId,
            sessionId: `session_${Date.now()}`,
            history: [],
            deviceLocation: null,
        };
    }

    setDeviceLocation(location: AgentGeoPoint | null) {
        this.context.deviceLocation = location;
    }

    private pushHistory(role: 'user' | 'assistant' | 'tool', content: string) {
        this.context.history.push({ role, content });
        if (this.context.history.length > AgentExecutor.MAX_HISTORY_ITEMS) {
            this.context.history = this.context.history.slice(-AgentExecutor.MAX_HISTORY_ITEMS);
        }
    }

    private getRecentConversationContext(): string {
        if (this.context.history.length === 0) {
            return 'No prior conversation.';
        }

        return this.context.history
            .slice(-12)
            .map(item => `${item.role}: ${item.content}`)
            .join('\n');
    }

    /**
     * Main entry point for user prompts
     */
    async process(prompt: string, onUpdate?: (text: string) => void): Promise<AgentResponse> {
        this.pushHistory('user', prompt);

        const pendingWriteResponse = await this.continuePendingWriteAction(prompt);
        if (pendingWriteResponse) {
            if (pendingWriteResponse.finalAnswer) {
                const normalizedAnswer = normalizeAssistantReply(pendingWriteResponse.finalAnswer);
                if (normalizedAnswer) {
                    pendingWriteResponse.finalAnswer = normalizedAnswer;
                    this.pushHistory('assistant', normalizedAnswer);
                }
            }
            return pendingWriteResponse;
        }

        const pendingResponse = await this.continuePendingCourseAction(prompt);
        if (pendingResponse) {
            if (pendingResponse.finalAnswer) {
                const normalizedAnswer = normalizeAssistantReply(pendingResponse.finalAnswer);
                if (normalizedAnswer) {
                    pendingResponse.finalAnswer = normalizedAnswer;
                    this.pushHistory('assistant', normalizedAnswer);
                }
            }
            return pendingResponse;
        }

        const routed = await this.tryLocalRoute(prompt);
        if (routed) {
            if (routed.finalAnswer) {
                const normalizedAnswer = normalizeAssistantReply(routed.finalAnswer);
                if (normalizedAnswer) {
                    routed.finalAnswer = normalizedAnswer;
                    this.pushHistory('assistant', normalizedAnswer);
                }
            }
            return routed;
        }

        let currentStep = 0;
        const maxSteps = 5;
        const steps: AgentStep[] = [];

        while (currentStep < maxSteps) {
            // 1. Ask real LLM for next step
            const decision = await this.realDeepSeekCall(prompt, steps, onUpdate);
            steps.push(decision);

            if (!decision.action) {
                // No more actions, the LLM has provided the final answer
                break;
            }

            // 2. Execute the Tool
            const observation = await this.executeTool(decision.action.tool, decision.action.input);
            decision.observation = observation;
            this.pushHistory('tool', `${decision.action.tool}: ${observation}`);

            currentStep++;
        }

        const finalAnswer = normalizeAssistantReply(steps[steps.length - 1].reply || steps[steps.length - 1].thought);
        if (finalAnswer) {
            this.pushHistory('assistant', finalAnswer);
        }

        return {
            steps,
            finalAnswer
        };
    }

    private async tryLocalRoute(prompt: string): Promise<AgentResponse | null> {
        const publishIntent = detectCoursePublishIntent(prompt);
        if (publishIntent) {
            const response = await this.startCourseAction(prompt, publishIntent);
            return {
                steps: [{
                    thought: '本地命中课程社区发布请求',
                    reply: response
                }],
                finalAnswer: response
            };
        }

        if (isDateQuery(prompt)) {
            const observation = this.readCurrentDateInfo(prompt);
            return {
                steps: [{
                    thought: '本地命中日期查询',
                    reply: observation
                }],
                finalAnswer: observation
            };
        }

        if (isScheduleQuery(prompt)) {
            const observation = await this.readUserSchedule(prompt);
            return {
                steps: [{
                    thought: '本地命中课表查询',
                    action: {
                        tool: 'read_user_schedule',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation
                }],
                finalAnswer: observation
            };
        }

        if (isNearbyPlaceQuery(prompt)) {
            const observation = await this.findNearbyPlace(prompt);
            return {
                steps: [{
                    thought: '本地命中附近地点查询',
                    action: {
                        tool: 'find_nearby_place',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation
                }],
                finalAnswer: observation
            };
        }

        if (isBuildingInfoQuery(prompt)) {
            const observation = await this.readCampusBuilding(prompt);
            return {
                steps: [{
                    thought: '本地命中建筑信息查询',
                    action: {
                        tool: 'read_campus_building',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation
                }],
                finalAnswer: observation
            };
        }

        if (isCourseCommunityQuery(prompt)) {
            const observation = await this.readCourseCommunity(prompt);
            return {
                steps: [{
                    thought: '本地命中课程社区查询',
                    action: {
                        tool: 'read_course_community',
                        input: { query: prompt }
                    },
                    observation,
                    reply: observation
                }],
                finalAnswer: observation
            };
        }

        return null;
    }

    private async continuePendingWriteAction(prompt: string): Promise<AgentResponse | null> {
        if (!this.pendingWriteAction) return null;

        if (isCancelActionQuery(prompt)) {
            this.pendingWriteAction = null;
            this.pendingCourseAction = null;
            const reply = '已取消这次写入操作。你如果想改内容，直接重新告诉我，我会先给你确认稿。';
            return {
                steps: [{
                    thought: '用户取消待确认写入',
                    reply,
                }],
                finalAnswer: reply,
            };
        }

        if (isConfirmActionQuery(prompt)) {
            const reply = await this.executePendingWriteAction();
            return {
                steps: [{
                    thought: '用户确认执行写入',
                    reply,
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
            }],
            finalAnswer: reply,
        };
    }

    private async continuePendingCourseAction(prompt: string): Promise<AgentResponse | null> {
        if (!this.pendingCourseAction) return null;

        if (isCancelActionQuery(prompt)) {
            this.pendingCourseAction = null;
            return {
                steps: [{
                    thought: '用户取消了待发布操作',
                    reply: '已取消这次发布操作。你之后随时告诉我课程和内容，我再帮你发。'
                }],
                finalAnswer: '已取消这次发布操作。你之后随时告诉我课程和内容，我再帮你发。'
            };
        }

        const response = await this.startCourseAction(prompt, this.pendingCourseAction.intent, this.pendingCourseAction);
        return {
            steps: [{
                thought: '继续补全课程社区发布信息',
                reply: response
            }],
            finalAnswer: response
        };
    }

    private async executeTool(toolName: string, input: any): Promise<string> {
        console.log(`[Agent] Executing tool: ${toolName}`, input);

        if (toolName === 'read_course_community') {
            const routedPublishIntent = detectCoursePublishIntent(input?.query || '');
            if (routedPublishIntent) {
                return this.startCourseAction(input?.query || '', routedPublishIntent, this.pendingCourseAction);
            }
        }

        // Real and Mock tool implementations
        switch (toolName) {
            case 'read_user_schedule':
                return this.readUserSchedule(input?.query || '');
            case 'read_campus_building':
                return this.readCampusBuilding(input?.query || '');
            case 'find_nearby_place':
                return this.findNearbyPlace(input?.query || '');
            case 'read_course_community':
                return this.readCourseCommunity(input?.query || '');
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
            case 'search_canteen_menu':
                return "Nearby Harmony Cafeteria has 'Spicy Chicken' on special today. It's only 5 mins from Hall 1.";
            case 'check_library_availability':
            case 'book_library_seat':
                return '图书馆自动化预约功能已下线，当前助手仅提供问答服务。';
            case 'search_campus_faq':
                // 1. Search local legacy FAQs
                const localResults = FAQService.searchFAQs(input.query);

                // 2. Search new Supabase Knowledge Base (73 chunks)
                const kbResults = await FAQService.searchKnowledgeBase(input.query);

                if (localResults.length === 0 && kbResults.length === 0) {
                    return "I couldn't find a specific answer in the official documents for that query. You might want to check the HKBU website directly.";
                }

                let responseText = "Here is what I found in the official HKBU records:\n\n";

                if (kbResults.length > 0) {
                    responseText += "### Official Student Handbook & Knowledge Base:\n";
                    responseText += kbResults.map((kb: any) => `- ${kb.content}`).join('\n\n');
                    responseText += "\n\n";
                }

                if (localResults.length > 0) {
                    responseText += "### Quick FAQ Reference:\n";
                    responseText += localResults.map(f => `Q: ${f.question_zh}\nA: ${f.answer_zh}`).join('\n\n');
                }

                return responseText;
            default:
                return `Error: Tool ${toolName} not found.`;
        }
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
            const entries = await getUserScheduleEntries(this.context.userId);
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

    private async realDeepSeekCall(prompt: string, previousSteps: AgentStep[], onUpdate?: (text: string) => void): Promise<AgentStep> {
        const systemPrompt = `You are "HKCampus Assistant" (浸大领航员), the exclusive AI assistant for Hong Kong Baptist University (HKBU) students.

## Your Persona & Tone:
1. You are a friendly, knowledgeable, and enthusiastic senior student at HKBU.
2. You speak naturally, concisely, and use emojis where appropriate.
3. Your primary language for replies is Chinese, but you can understand English perfectly. You may mix in common HKBU English slang (e.g., "Reg course", "AAB", "Main Lib", "Canteen").

## Core Rules & Boundaries:
1. EXCLUSIVE DOMAIN: You ONLY answer questions related to HKBU campus life, academic affairs, campus facilities (library, canteens, classrooms, dorms), student activities, and the HKCampus app.
2. REFUSAL POLICY: If a user asks a question completely unrelated to HKBU or university life (e.g., "Write a script", "Who is the US president", "Explain physics"), you MUST politely decline and steer the conversation back to campus topics.
   Example: "哈哈，这个问题超纲啦！作为你的专属校园助手，我更擅长带你吃遍浸大、找空闲课室或者抢图书馆座位哦。校园生活有什么需要帮忙的吗？🎓"
3. HONESTY: Do not hallucinate facts. If you do not know the answer, use a tool to find it.
4. PERSONAL SCHEDULE: If the user asks about their own classes, timetable, next class, or classes on a certain day, you MUST use the "read_user_schedule" tool.
5. COURSE COMMUNITY: If the user asks about a course's reviews, chatroom, teaming posts, or overall community status, you MUST use the "read_course_community" tool.
6. COURSE COMMUNITY POSTING: If the user wants to publish a course review, a teaming post, or a course chatroom message, first infer the course from recent conversation if possible. If still missing, ask for the course code. Once enough information is available, you MUST use the relevant posting tool instead of only giving instructions.
6. BUILDINGS: If the user asks where a building is, what a building code means, or asks about a campus building, you MUST use the "read_campus_building" tool.
7. NEARBY PLACES: If the user asks what is near them, where they are now, or which building/restaurant is closest, you MUST use the "find_nearby_place" tool.

Available Tools:
${JSON.stringify(TOOLS, null, 2)}

ReAct Protocol & Optimization:
1. If you NEED to use a tool, output ONLY "thought" (max 10 words) and "action".
2. If you CAN answer directly, output ONLY "reply" (generate this immediately so the user can see it streaming). DO NOT output "thought".

Response Format (JSON only):
{
  "thought": "Brief reasoning ONLY IF using a tool",
  "action": { "tool": "tool_name", "input": { "param": "value" } }, // ONLY IF using a tool
  "reply": "Your final response in Chinese (ONLY IF NOT using a tool)"
}

Current context:
- Recent conversation:
${this.getRecentConversationContext()}
- User Prompt: ${prompt}
- Progress so far: ${JSON.stringify(previousSteps)}`;

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
            });

            // Clean up potentially backticked JSON
            const jsonStr = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);

            return {
                thought: result.thought,
                reply: result.reply,
                action: result.action
            };
        } catch (e) {
            console.error('[Agent] Real LLM call failed, falling back to basic mock.', e);
            return { thought: "抱歉，由于网络或 API 问题，我暂时无法进行深度推理。请稍后再试。" };
        }
    }
}

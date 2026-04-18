import { clearAgentCache, getAgentCacheStats } from '../../../services/agent/cache';
import { AGENT_CONFIG } from '../../../services/agent/config';
import { AgentExecutor } from '../../../services/agent/executor';
import { callDeepSeek, callDeepSeekStream } from '../../../services/agent/llm';
import { getMemoryFact, saveMemoryFact } from '../../../services/agent/memory';
import { FAQService } from '../../../services/faq';

jest.mock('../../../services/agent/llm', () => ({
    callDeepSeek: jest.fn(),
    callDeepSeekStream: jest.fn(),
    resolveModelName: jest.fn((tier: 'fast' | 'reasoning') => tier === 'fast' ? 'mock-fast-model' : 'mock-reasoning-model'),
}));

jest.mock('../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
    getMemoryFact: jest.fn().mockResolvedValue(null),
    saveMemoryFact: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/agent/memory_extractor', () => ({
    extractMemoryCandidatesFromConversation: jest.fn().mockResolvedValue([]),
    filterMemoryCandidates: jest.fn().mockReturnValue([]),
}));

jest.mock('../../../services/faq', () => ({
    FAQService: {
        searchFAQs: jest.fn().mockReturnValue([]),
        searchKnowledgeBase: jest.fn().mockResolvedValue([]),
        buildCampusFaqAnswer: jest.fn((query: string, localResults: any[], kbResults: any[]) => {
            if (localResults.length === 0 && kbResults.length === 0) {
                return '我暂时没在现有校园资料里找到明确答案。你可以换几个关键词再问一次，或者直接查看 HKBU 官方网站。';
            }

            const bestFaq = localResults[0];
            const bestKb = kbResults[0];
            const sections = [
                `命中主题：${bestFaq?.question_zh || query}`,
                `结论：${bestFaq?.answer_zh || bestKb?.content || ''}`,
            ];

            if (kbResults.length > 0) {
                sections.push(`证据片段：\n1. ${bestKb.content}`);
            }

            sections.push(`建议来源：\n${bestFaq?.related_links?.[0] || 'https://example.com'}`);
            return sections.join('\n\n');
        }),
    },
}));

jest.mock('../../../services/schedule', () => ({
    getUserScheduleEntries: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/agent/campus_queries', () => ({
    formatBuildingInfo: jest.fn(),
    formatNearbyPlaceInfo: jest.fn(),
    isBuildingInfoQuery: jest.fn().mockReturnValue(false),
    isNearbyPlaceQuery: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../services/auth', () => ({
    getCurrentUser: jest.fn().mockResolvedValue({
        uid: 'user-1',
        displayName: 'Tim',
        avatarUrl: 'https://example.com/avatar.png',
        major: 'Computer Science',
        email: 'tim@life.hkbu.edu.hk',
    }),
}));

const mockGetCourseByCode = jest.fn();
const mockSearchCourses = jest.fn();
const mockGetReviews = jest.fn();
const mockAddReview = jest.fn();

jest.mock('../../../services/courses', () => ({
    getCourseByCode: (...args: any[]) => mockGetCourseByCode(...args),
    searchCourses: (...args: any[]) => mockSearchCourses(...args),
    getReviews: (...args: any[]) => mockGetReviews(...args),
    addReview: (...args: any[]) => mockAddReview(...args),
}));

const mockFetchTeamingRequests = jest.fn();
const mockPostTeamingRequest = jest.fn();

jest.mock('../../../services/teaming', () => ({
    fetchTeamingRequests: (...args: any[]) => mockFetchTeamingRequests(...args),
    postTeamingRequest: (...args: any[]) => mockPostTeamingRequest(...args),
}));

const mockInsert = jest.fn();
const createQueryChain = () => {
    const chain: any = {
        in: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return chain;
};

const mockFrom = jest.fn((table: string) => {
    if (table === 'messages') {
        return {
            insert: mockInsert,
            select: jest.fn(() => createQueryChain()),
        };
    }

    return {
        select: jest.fn(() => createQueryChain()),
    };
});

jest.mock('../../../services/supabase', () => ({
    supabase: {
        from: (table: string) => mockFrom(table),
    },
}));

describe('AgentExecutor course publishing flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearAgentCache();
        mockGetCourseByCode.mockResolvedValue(null);
        mockSearchCourses.mockResolvedValue([]);
        mockGetReviews.mockResolvedValue([]);
        mockAddReview.mockResolvedValue({ error: null });
        mockFetchTeamingRequests.mockResolvedValue([]);
        mockPostTeamingRequest.mockResolvedValue({ success: true, data: { id: 'team-1' } });
        mockInsert.mockResolvedValue({ error: null });
        (callDeepSeek as jest.Mock).mockReset();
        AGENT_CONFIG.DEEPSEEK_ENABLED = false;
    });

    it('asks for course code when user says 我想组队 without usable context', async () => {
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('我想组队');

        expect(response.finalAnswer).toContain('上下文里我还没定位到具体课程');
        expect(mockPostTeamingRequest).not.toHaveBeenCalled();
    });

    it('treats 我想要组队 as the same teaming intent and continues with course code', async () => {
        const executor = new AgentExecutor('user-1');
        const course = {
            id: 'course-10',
            code: 'COMP3026',
            name: 'Project',
            instructor: 'Dr. Ho',
            department: 'CS',
            credits: 3,
            rating: 0,
            reviewCount: 0,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP3026' ? course : null);

        const first = await executor.process('我想要组队');
        expect(first.finalAnswer).toContain('上下文里我还没定位到具体课程');

        const second = await executor.process('COMP3026');
        expect(second.finalAnswer).toContain('COMP3026');
        expect(second.finalAnswer).toContain('section');
    });

    it('treats 我希望组队 as the same teaming intent', async () => {
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('我希望组队');

        expect(response.finalAnswer).toContain('前面的上下文里我还没定位到具体课程');
    });

    it('reuses recent course context for teaming and posts after missing fields are supplied', async () => {
        const executor = new AgentExecutor('user-1');
        const course = {
            id: 'course-1',
            code: 'COMP3015',
            name: 'Networking',
            instructor: 'Dr. Chan',
            department: 'CS',
            credits: 3,
            rating: 4.2,
            reviewCount: 8,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP3015' ? course : null);

        const first = await executor.process('COMP3015 这门课怎么样');
        expect(first.finalAnswer).toContain('目前还没有评价');

        const second = await executor.process('我想组队');
        expect(second.finalAnswer).toContain('COMP3015');
        expect(second.finalAnswer).toContain('section');

        const third = await executor.process('section A1，我会前端和写报告，想找靠谱队友');
        expect(third.finalAnswer).toContain('我准备发布 COMP3015 组队帖');

        const confirmed = await executor.process('确认');
        expect(confirmed.finalAnswer).toContain('已经帮你发出 COMP3015 的组队帖');
        expect(mockPostTeamingRequest).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'course-1',
            section: 'A1',
            selfIntro: '我会前端和写报告，想找靠谱队友',
        }));
    });

    it('asks for review rating before posting course review', async () => {
        const executor = new AgentExecutor('user-1');
        const course = {
            id: 'course-2',
            code: 'COMP2016',
            name: 'Software Engineering',
            instructor: 'Dr. Lee',
            department: 'CS',
            credits: 3,
            rating: 4,
            reviewCount: 10,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP2016' ? course : null);

        const first = await executor.process('帮我发个 COMP2016 评价：老师讲得清楚，但是 project 很重');
        expect(first.finalAnswer).toContain('1 到 5 星的评分');
        expect(mockAddReview).not.toHaveBeenCalled();

        const second = await executor.process('4星');
        expect(second.finalAnswer).toContain('我准备发布到 COMP2016 的评价是');

        const confirmed = await executor.process('确认');
        expect(confirmed.finalAnswer).toContain('已经帮你把这条 4 星评价发到 COMP2016');
        expect(mockAddReview).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'course-2',
            rating: 4,
            content: '老师讲得清楚，但是 project 很重',
        }));
    });

    it('sends course chat message directly when course and content are both present', async () => {
        const executor = new AgentExecutor('user-1');
        const course = {
            id: 'course-3',
            code: 'COMP1015',
            name: 'Intro',
            instructor: 'Dr. Wong',
            department: 'CS',
            credits: 3,
            rating: 0,
            reviewCount: 0,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP1015' ? course : null);

        const response = await executor.process('帮我发到 COMP1015 聊天室：有人一起复习 midterm 吗？');
        expect(response.finalAnswer).toContain('我准备发到 COMP1015 聊天室的内容是');

        const confirmed = await executor.process('确认');
        expect(confirmed.finalAnswer).toContain('已经帮你发到 COMP1015 聊天室');
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            course_id: 'course-3',
            sender_id: 'user-1',
            content: '有人一起复习 midterm 吗？',
        }));
    });

    it('reroutes mistaken read_course_community tool calls back into teaming publish flow', async () => {
        const executor = new AgentExecutor('user-1');
        const course = {
            id: 'course-4',
            code: 'COMP4001',
            name: 'Capstone',
            instructor: 'Dr. Yip',
            department: 'CS',
            credits: 3,
            rating: 0,
            reviewCount: 0,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP4001' ? course : null);

        await executor.process('我想组队');
        const result = await (executor as any).executeTool('read_course_community', { query: '用户想组队，需要先了解具体课程' });
        expect(result).toContain('上下文里我还没定位到具体课程');

        const followUp = await executor.process('COMP4001');
        expect(followUp.finalAnswer).toContain('COMP4001');
        expect(followUp.finalAnswer).toContain('section');
    });

    it('sanitizes mechanical meta replies before showing them to users', async () => {
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('我希望组队');
        expect(response.finalAnswer).not.toContain('用户想组队');
        expect(response.finalAnswer).not.toContain('需要现在的课程信息');
    });

    it('routes campus FAQ queries locally without calling the LLM', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-1',
                question: 'What is GPA?',
                question_zh: 'GPA 怎么算？',
                answer: 'Use grade points.',
                answer_zh: 'GPA 按课程成绩对应绩点计算。',
                keywords: ['gpa'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const response = await executor.process('GPA 怎么算？');

        expect(response.finalAnswer).toContain('GPA 怎么算');
        expect(response.steps[0].action?.tool).toBe('search_campus_faq');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('includes knowledge base snippets in local FAQ answers', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([
            {
                content: 'Library opening hours vary by semester and examination period.',
                metadata: { h2: 'Library' },
            },
        ]);

        const response = await executor.process('图书馆几点开门？');

        expect(response.finalAnswer).toContain('证据片段');
        expect(response.finalAnswer).toContain('Library opening hours vary');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('routes IT support style queries locally as campus FAQ', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-2',
                question: 'How do I connect to Wi-Fi?',
                question_zh: '校园 Wi-Fi 怎么连？',
                answer: 'Use eduroam.',
                answer_zh: '校园无线网络通常使用 eduroam 登录。',
                keywords: ['wifi', 'eduroam', 'it service'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const response = await executor.process('校园 wifi 怎么连？');

        expect(response.steps[0].action?.tool).toBe('search_campus_faq');
        expect(response.finalAnswer).toContain('结论');
        expect(response.finalAnswer).toContain('eduroam');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('formats FAQ answers with conclusion first and short references', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-3',
                question: 'Where can I find the academic calendar?',
                question_zh: '校历在哪里看？',
                answer: 'Check the academic calendar page.',
                answer_zh: '可以在 HKBU Academic Calendar 页面查看校历。',
                keywords: ['calendar', 'academic calendar', '校历'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([
            {
                content: 'The Academic Calendar provides semester dates, teaching periods, and examination schedules.',
                metadata: { h2: 'Academic Calendar' },
            },
        ]);

        const response = await executor.process('academic calendar 在哪里看？');

        expect(response.finalAnswer).toContain('命中主题：');
        expect(response.finalAnswer).toContain('结论：');
        expect(response.finalAnswer).toContain('证据片段：');
        expect(response.finalAnswer).toContain('建议来源：');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('uses intent routing to bypass the LLM for colloquial schedule queries', async () => {
        const executor = new AgentExecutor('user-1');
        const { getUserScheduleEntries } = jest.requireMock('../../../services/schedule');
        getUserScheduleEntries.mockResolvedValue([
            {
                title: 'Operating Systems',
                courseCode: 'COMP3005',
                startTime: '09:00',
                endTime: '10:00',
                room: 'AAB201',
                dayOfWeek: 3,
            },
        ]);

        const response = await executor.process('我今日有咩堂？');

        expect(response.steps[0].action?.tool).toBe('read_user_schedule');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('reuses cached FAQ results for repeated local queries', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-4',
                question: 'How to pay tuition fees?',
                question_zh: '学费怎么交？',
                answer: 'Follow the payment guide.',
                answer_zh: '按学校缴费指引完成支付。',
                keywords: ['tuition', '学费'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const first = await executor.process('学费怎么交？');
        const second = await executor.process('学费怎么交？');

        expect(first.finalAnswer).toContain('结论：');
        expect(second.finalAnswer).toContain('结论：');
        expect(FAQService.searchFAQs).toHaveBeenCalledTimes(1);
        expect(FAQService.searchKnowledgeBase).toHaveBeenCalledTimes(1);
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('caches low-risk direct LLM replies across fresh sessions', async () => {
        (callDeepSeekStream as jest.Mock).mockResolvedValue('{"reply":"HKBU is known for its communication, business, and science programs."}');

        const firstExecutor = new AgentExecutor('user-1');
        const first = await firstExecutor.process('HKBU 有什么特色？');

        const secondExecutor = new AgentExecutor('user-1');
        const second = await secondExecutor.process('HKBU 有什么特色？');

        expect(first.finalAnswer).toContain('HKBU is known');
        expect(second.finalAnswer).toContain('HKBU is known');
        expect(callDeepSeekStream).toHaveBeenCalledTimes(1);
    });

    it('tracks cache hit and write statistics', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-5',
                question: 'How to use eduroam?',
                question_zh: 'eduroam 怎么连？',
                answer: 'Use your student account.',
                answer_zh: '使用学生账号登录 eduroam。',
                keywords: ['wifi', 'eduroam'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        await executor.process('eduroam 怎么连？');
        await executor.process('eduroam 怎么连？');

        const stats = getAgentCacheStats();
        expect(stats.writes).toBeGreaterThan(0);
        expect(stats.hits).toBeGreaterThan(0);
    });

    it('uses fast model routing for simple direct questions', async () => {
        (callDeepSeekStream as jest.Mock).mockResolvedValue('{"reply":"HKBU founded in 1956."}');

        const executor = new AgentExecutor('user-1');
        const response = await executor.process('HKBU 是哪一年成立的？');

        expect(response.steps[0].modelTier).toBe('fast');
        expect((callDeepSeekStream as jest.Mock).mock.calls[0][2]).toEqual(expect.objectContaining({
            model: expect.any(String),
        }));
    });

    it('uses reasoning model routing for complex analysis questions', async () => {
        (callDeepSeekStream as jest.Mock).mockResolvedValue('{"reply":"你可以从 workload、时间表和 prerequisite 三方面比较。"}');

        const executor = new AgentExecutor('user-1');
        const response = await executor.process('帮我分析一下这学期应该怎么安排学习计划，并给我一个详细理由');

        expect(response.steps[0].modelTier).toBe('reasoning');
        expect(response.steps[0].routeReason).toContain('complex');
    });

    it('re-evaluates model tier after tool observations in multi-step react', async () => {
        (callDeepSeekStream as jest.Mock)
            .mockResolvedValueOnce('{"thought":"先查 FAQ","action":{"tool":"search_campus_faq","input":{"query":"HKBU 历史"}}}')
            .mockResolvedValueOnce('{"reply":"综合来看，HKBU 有较长的办学历史。"}');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([
            {
                content: 'Hong Kong Baptist University has a long institutional history.',
                metadata: { h2: 'About HKBU' },
                score: 16,
            },
        ]);

        const executor = new AgentExecutor('user-1');
        const response = await executor.process('HKBU 有什么背景？');

        expect(response.steps).toHaveLength(2);
        expect(response.steps[0].modelTier).toBe('fast');
        expect(response.steps[1].modelTier).toBe('reasoning');
        expect(response.steps[1].routeReason).toContain('tool');
        expect((callDeepSeekStream as jest.Mock).mock.calls[0][2]).toEqual(expect.objectContaining({
            model: 'mock-fast-model',
        }));
        expect((callDeepSeekStream as jest.Mock).mock.calls[1][2]).toEqual(expect.objectContaining({
            model: 'mock-reasoning-model',
        }));
    });

    it('compresses older conversation into history summary', async () => {
        const executor = new AgentExecutor('user-1') as any;

        for (let i = 0; i < 14; i += 1) {
            executor.pushHistory('user', `message-${i}`);
        }

        expect(executor.context.history.length).toBeLessThanOrEqual(7);
        expect(executor.context.historySummary).toContain('Earlier conversation summary');
        expect(executor.getRecentConversationContext()).toContain('Structured session state');
    });

    it('upgrades long-conversation summary with fast model when available', async () => {
        AGENT_CONFIG.DEEPSEEK_ENABLED = true;
        (callDeepSeek as jest.Mock).mockResolvedValue('{"summary":"User previously discussed COMP3015 and still has an unresolved course question."}');
        const executor = new AgentExecutor('user-1') as any;

        for (let i = 0; i < 14; i += 1) {
            executor.pushHistory('user', `message-${i}`);
        }

        await executor.process('HKBU 是哪一年成立的？');

        expect(callDeepSeek).toHaveBeenCalled();
        expect(executor.context.historySummary).toContain('Model conversation summary');
    });

    it('tracks referenced course in session state', async () => {
        const executor = new AgentExecutor('user-1') as any;

        await executor.process('COMP3015 这门课怎么样');

        expect(executor.context.sessionState.referencedCourse).toBe('COMP3015');
    });

    it('resolves recent course context from session state after history compression', async () => {
        const executor = new AgentExecutor('user-1') as any;
        const course = {
            id: 'course-9',
            code: 'COMP3015',
            name: 'Networking',
            instructor: 'Dr. Chan',
            department: 'CS',
            credits: 3,
            rating: 4.2,
            reviewCount: 8,
        };

        mockGetCourseByCode.mockImplementation(async (code: string) => code === 'COMP3015' ? course : null);

        executor.context.sessionState.referencedCourse = 'COMP3015';
        for (let i = 0; i < 14; i += 1) {
            executor.pushHistory('assistant', `filler-${i}`);
        }

        const resolvedCourse = await executor.resolveCourseFromRecentContext();
        expect(resolvedCourse?.code).toBe('COMP3015');
    });

    it('handles memory write via stable subtask without calling the LLM', async () => {
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('记住我住在 Hall 3');

        expect(response.finalAnswer).toContain('我准备记住这条信息');
        expect(response.steps[0].routeReason).toContain('memory write');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('handles memory read via stable subtask without calling the LLM', async () => {
        (getMemoryFact as jest.Mock).mockResolvedValue('Computer Science');
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('你记得我的专业吗？');

        expect(response.finalAnswer).toContain('Computer Science');
        expect(response.steps[0].routeReason).toContain('memory read');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('runs the post-response memory pass after a normal non-LLM reply', async () => {
        const extractor = jest.requireMock('../../../services/agent/memory_extractor');
        extractor.extractMemoryCandidatesFromConversation.mockResolvedValue([
            {
                should_store: true,
                key: 'preferred_name',
                value: 'Tim',
                memory_type: 'long_term_preference',
                confidence: 0.96,
                reason: 'durable naming preference',
            },
        ]);
        extractor.filterMemoryCandidates.mockReturnValue([
            {
                key: 'nickname',
                value: 'Tim',
                memoryType: 'long_term_preference',
                confidence: 0.96,
                reason: 'durable naming preference',
            },
        ]);
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-6',
                question: 'What is GPA?',
                question_zh: 'GPA 怎么算？',
                answer: 'Use grade points.',
                answer_zh: 'GPA 按课程成绩对应绩点计算。',
                keywords: ['gpa'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const executor = new AgentExecutor('user-1');
        const response = await executor.process('GPA 怎么算？');

        expect(extractor.extractMemoryCandidatesFromConversation).toHaveBeenCalledWith({
            recentTurns: [
                { role: 'user', content: 'GPA 怎么算？' },
                { role: 'assistant', content: response.finalAnswer },
            ],
        });
        expect(saveMemoryFact).toHaveBeenCalledWith('user-1', 'nickname', 'Tim');
    });

    it('runs the post-response memory pass after a cached direct reply hit', async () => {
        const extractor = jest.requireMock('../../../services/agent/memory_extractor');
        (callDeepSeekStream as jest.Mock).mockResolvedValue('{"reply":"HKBU is known for its communication, business, and science programs."}');
        extractor.extractMemoryCandidatesFromConversation.mockResolvedValue([]);

        const firstExecutor = new AgentExecutor('user-1');
        const first = await firstExecutor.process('HKBU 有什么特色？');

        extractor.extractMemoryCandidatesFromConversation.mockClear();
        (saveMemoryFact as jest.Mock).mockClear();

        const secondExecutor = new AgentExecutor('user-1');
        const second = await secondExecutor.process('HKBU 有什么特色？');

        expect(first.finalAnswer).toContain('HKBU is known');
        expect(second.finalAnswer).toContain('HKBU is known');
        expect(callDeepSeekStream).toHaveBeenCalledTimes(1);
        expect(extractor.extractMemoryCandidatesFromConversation).toHaveBeenCalledWith({
            recentTurns: [
                { role: 'user', content: 'HKBU 有什么特色？' },
                { role: 'assistant', content: second.finalAnswer },
            ],
        });
    });

    it('does not break the main reply when memory extraction fails', async () => {
        const extractor = jest.requireMock('../../../services/agent/memory_extractor');
        extractor.extractMemoryCandidatesFromConversation.mockRejectedValue(new Error('llm down'));
        extractor.filterMemoryCandidates.mockReturnValue([]);
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-7',
                question: 'What is GPA?',
                question_zh: 'GPA 怎么算？',
                answer: 'Use grade points.',
                answer_zh: 'GPA 按课程成绩对应绩点计算。',
                keywords: ['gpa'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const executor = new AgentExecutor('user-1');
        const response = await executor.process('GPA 怎么算？');

        expect(response.finalAnswer || '').toContain('GPA');
    });

    it('caps accepted memories to three writes per pass', async () => {
        const extractor = jest.requireMock('../../../services/agent/memory_extractor');
        extractor.extractMemoryCandidatesFromConversation.mockResolvedValue([]);
        extractor.filterMemoryCandidates.mockReturnValue([
            {
                key: 'nickname',
                value: 'Tim',
                memoryType: 'long_term_preference',
                confidence: 0.9,
                reason: 'a',
            },
            {
                key: 'major',
                value: 'Computer Science',
                memoryType: 'background_fact',
                confidence: 0.9,
                reason: 'b',
            },
            {
                key: 'favorite_food',
                value: 'spicy',
                memoryType: 'long_term_preference',
                confidence: 0.9,
                reason: 'c',
            },
            {
                key: 'future_plan.exchange',
                value: 'next term',
                memoryType: 'background_fact',
                confidence: 0.9,
                reason: 'd',
            },
        ]);

        const executor = new AgentExecutor('user-1');
        await executor.process('以后叫我 Tim，我读 CS，喜欢吃辣，下学期想交换');

        expect(saveMemoryFact).toHaveBeenCalledTimes(3);
    });

    it('handles normalized FAQ lookup via stable subtask without calling the LLM', async () => {
        const executor = new AgentExecutor('user-1');
        (FAQService.searchFAQs as jest.Mock).mockReturnValue([
            {
                id: 'faq-main-lib',
                question: 'When does the library open?',
                question_zh: '图书馆几点开门？',
                answer: 'Check opening hours.',
                answer_zh: '图书馆开放时间会按学期调整。',
                keywords: ['library', '图书馆'],
            },
        ]);
        (FAQService.searchKnowledgeBase as jest.Mock).mockResolvedValue([]);

        const response = await executor.process('main lib 开门时间');

        expect(response.steps[0].path).toBe('stable_task');
        expect(response.steps[0].action?.tool).toBe('search_campus_faq');
        expect(response.steps[0].routeReason).toContain('stable faq lookup');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });

    it('does not let stable memory tasks swallow composite intents', async () => {
        (getMemoryFact as jest.Mock).mockResolvedValue('Computer Science');
        const executor = new AgentExecutor('user-1');

        const response = await executor.process('你记得我的专业吗，顺便帮我看看附近有什么吃的');

        expect(response.steps[0].action?.tool).toBe('find_nearby_place');
        expect(callDeepSeekStream).not.toHaveBeenCalled();
    });
});

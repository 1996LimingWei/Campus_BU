import { AgentExecutor } from '../../../services/agent/executor';

jest.mock('../../../services/agent/llm', () => ({
    callDeepSeekStream: jest.fn(),
}));

jest.mock('../../../services/agent/memory', () => ({
    getAllUserFacts: jest.fn().mockResolvedValue({}),
    saveMemoryFact: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/faq', () => ({
    FAQService: {
        searchFAQs: jest.fn().mockReturnValue([]),
        searchKnowledgeBase: jest.fn().mockResolvedValue([]),
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
        from: (...args: any[]) => mockFrom(...args),
    },
}));

describe('AgentExecutor course publishing flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCourseByCode.mockResolvedValue(null);
        mockSearchCourses.mockResolvedValue([]);
        mockGetReviews.mockResolvedValue([]);
        mockAddReview.mockResolvedValue({ error: null });
        mockFetchTeamingRequests.mockResolvedValue([]);
        mockPostTeamingRequest.mockResolvedValue({ success: true, data: { id: 'team-1' } });
        mockInsert.mockResolvedValue({ error: null });
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
        expect(third.finalAnswer).toContain('已经帮你发出 COMP3015 的组队帖');
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
        expect(second.finalAnswer).toContain('已经帮你把这条 4 星评价发到 COMP2016');
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

        expect(response.finalAnswer).toContain('已经帮你发到 COMP1015 聊天室');
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
});

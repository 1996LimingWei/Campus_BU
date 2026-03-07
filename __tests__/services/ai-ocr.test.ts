import { getPrimaryExtractedSchedule, scanScheduleFromImage } from '../../services/ai-ocr';

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;
// Mock FormData
global.FormData = jest.fn(() => ({
    append: jest.fn(),
})) as any;

describe('AI OCR Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return extracted schedule data when fetch is successful', async () => {
        const mockApiResponse = {
            items: [
                {
                    course_name: 'Mathematics 101',
                    room: 'Room A202',
                    day_of_week: 1,
                    start_time: '09:00',
                    end_time: '11:00'
                }
            ]
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockApiResponse)
        });

        const result = await scanScheduleFromImage('file://mock-image-path.jpg');

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(result.items).toHaveLength(1);
        expect(getPrimaryExtractedSchedule(result)).toEqual({
            course: 'Mathematics 101',
            room: 'Room A202',
            time: '周一 09:00 - 11:00'
        });
    });

    it('should return fallback data if extraction is not present but fetch is ok', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({})
        });

        const result = await scanScheduleFromImage('file://mock-image-path.jpg');

        expect(getPrimaryExtractedSchedule(result)).toEqual({
            course: '未能识别',
            room: '未能识别',
            time: '未能识别'
        });
    });

    it('should keep manual-review fallback items as importable tasks', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                items: [
                    {
                        source_block: '当前版本改为人工确认导入。请先搜索课程，再手动补充星期、时间和教室。',
                        needs_review: true,
                    }
                ]
            })
        });

        const result = await scanScheduleFromImage('file://mock-image-path.jpg');

        expect(result.items).toHaveLength(1);
        expect(result.items[0].needsReview).toBe(true);
        expect(getPrimaryExtractedSchedule(result)).toEqual({
            course: '当前版本改为人工确认导入。请先搜索课程，再手动补...',
            room: '待人工补充',
            time: '待人工补充'
        });
    });

    it('should throw error when the AI backend responds with an error status', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500
        });

        await expect(scanScheduleFromImage('file://mock-image-path.jpg'))
            .rejects
            .toThrow('AI Backend Error: 500');
    });
});

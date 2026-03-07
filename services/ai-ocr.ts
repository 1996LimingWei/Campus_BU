const AI_BACKEND_URL = 'http://192.168.5.70:8000';

export interface ExtractedSchedule {
    course: string;
    room: string;
    time: string;
}

export interface ExtractedScheduleItem {
    id: string;
    sourceBlock?: string;
    courseName?: string;
    courseCode?: string;
    teacher?: string;
    room?: string;
    dayOfWeek?: number;
    dayText?: string;
    startTime?: string;
    endTime?: string;
    startPeriod?: number;
    endPeriod?: number;
    weekText?: string;
    confidence?: number;
    needsReview: boolean;
}

export interface ScheduleScanResult {
    items: ExtractedScheduleItem[];
    rawResponse?: unknown;
    engine?: string;
}

const DAY_MAP: Record<string, number> = {
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7,
    '周一': 1,
    '星期一': 1,
    '週一': 1,
    '周二': 2,
    '星期二': 2,
    '週二': 2,
    '周三': 3,
    '星期三': 3,
    '週三': 3,
    '周四': 4,
    '星期四': 4,
    '週四': 4,
    '周五': 5,
    '星期五': 5,
    '週五': 5,
    '周六': 6,
    '星期六': 6,
    '週六': 6,
    '周日': 7,
    '星期日': 7,
    '星期天': 7,
    '週日': 7,
};

const normalizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizeTime = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().replace('.', ':').replace(/\s+/g, '');
    const match = normalized.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return undefined;
    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    return `${hours}:${minutes}`;
};

const getDayOfWeek = (value: unknown): number | undefined => {
    if (typeof value === 'number' && value >= 1 && value <= 7) {
        return value;
    }

    const text = normalizeText(value);
    if (!text) return undefined;

    const normalized = text.toLowerCase();
    const directMatch = DAY_MAP[normalized];
    if (directMatch) return directMatch;

    const found = Object.entries(DAY_MAP).find(([key]) => normalized.includes(key));
    return found?.[1];
};

const getDayLabel = (dayOfWeek?: number): string | undefined => {
    switch (dayOfWeek) {
        case 1: return '周一';
        case 2: return '周二';
        case 3: return '周三';
        case 4: return '周四';
        case 5: return '周五';
        case 6: return '周六';
        case 7: return '周日';
        default: return undefined;
    }
};

const buildTimeLabel = (item: ExtractedScheduleItem): string | undefined => {
    const day = item.dayText || getDayLabel(item.dayOfWeek);
    const timeRange = item.startTime && item.endTime
        ? `${item.startTime} - ${item.endTime}`
        : item.startPeriod && item.endPeriod
            ? `第${item.startPeriod}-${item.endPeriod}节`
            : undefined;

    if (day && timeRange) return `${day} ${timeRange}`;
    return day || timeRange || item.weekText;
};

const buildManualReviewLabel = (item: ExtractedScheduleItem): string | undefined => {
    const sourceBlock = normalizeText(item.sourceBlock);
    if (!sourceBlock) return undefined;
    return sourceBlock.length > 24 ? `${sourceBlock.slice(0, 24)}...` : sourceBlock;
};

const parseLegacyTimeText = (value: unknown): Pick<ExtractedScheduleItem, 'dayOfWeek' | 'dayText' | 'startTime' | 'endTime' | 'weekText'> => {
    const text = normalizeText(value);
    if (!text) return {};

    const dayOfWeek = getDayOfWeek(text);
    const timeMatch = text.match(/(\d{1,2}[:.]\d{2})\s*[-~至到]\s*(\d{1,2}[:.]\d{2})/);

    return {
        dayOfWeek,
        dayText: getDayLabel(dayOfWeek),
        startTime: normalizeTime(timeMatch?.[1]),
        endTime: normalizeTime(timeMatch?.[2]),
        weekText: text,
    };
};

const normalizeItem = (item: any, index: number): ExtractedScheduleItem | null => {
    if (!item || typeof item !== 'object') return null;

    const dayOfWeek = getDayOfWeek(
        item.day_of_week ??
        item.dayOfWeek ??
        item.day ??
        item.weekday ??
        item.time
    );

    const legacyTime = parseLegacyTimeText(item.time ?? item.schedule_text ?? item.week_text);
    const normalizedCourseName = normalizeText(item.course_name ?? item.courseName ?? item.course);
    const normalizedStartTime = normalizeTime(item.start_time ?? item.startTime) ?? legacyTime.startTime;
    const normalizedEndTime = normalizeTime(item.end_time ?? item.endTime) ?? legacyTime.endTime;
    const normalizedStartPeriod = typeof item.start_period === 'number'
        ? item.start_period
        : typeof item.startPeriod === 'number'
            ? item.startPeriod
            : undefined;
    const normalizedEndPeriod = typeof item.end_period === 'number'
        ? item.end_period
        : typeof item.endPeriod === 'number'
            ? item.endPeriod
            : undefined;
    const providedNeedsReview = item.needs_review ?? item.needsReview;

    const normalized: ExtractedScheduleItem = {
        id: String(item.id ?? `ocr-item-${index}`),
        sourceBlock: normalizeText(item.source_block ?? item.sourceBlock ?? item.raw_text),
        courseName: normalizedCourseName,
        courseCode: normalizeText(item.course_code ?? item.courseCode ?? item.code),
        teacher: normalizeText(item.teacher ?? item.teacher_name ?? item.instructor),
        room: normalizeText(item.room ?? item.classroom ?? item.location),
        dayOfWeek: dayOfWeek ?? legacyTime.dayOfWeek,
        dayText: normalizeText(item.day_text ?? item.dayText) ?? getDayLabel(dayOfWeek ?? legacyTime.dayOfWeek),
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        startPeriod: normalizedStartPeriod,
        endPeriod: normalizedEndPeriod,
        weekText: normalizeText(item.week_text ?? item.weekText ?? item.time) ?? legacyTime.weekText,
        confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
        needsReview: typeof providedNeedsReview === 'boolean'
            ? providedNeedsReview
            : Boolean(
                !normalizedCourseName ||
                !(dayOfWeek ?? legacyTime.dayOfWeek) ||
                (!(normalizedStartTime && normalizedEndTime) && !(normalizedStartPeriod && normalizedEndPeriod))
            ),
    };

    if (!normalized.courseName && !normalized.courseCode && !normalized.room && !normalized.weekText && !normalized.sourceBlock) {
        return null;
    }

    return normalized;
};

export const normalizeScheduleScanResponse = (data: any): ScheduleScanResult => {
    const sourceItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.courses)
            ? data.courses
            : Array.isArray(data?.raw_response)
                ? data.raw_response
                : data?.raw_response?.courses && Array.isArray(data.raw_response.courses)
                    ? data.raw_response.courses
                    : data?.extraction
                        ? [data.extraction]
                        : [];

    const items = sourceItems
        .map((item: any, index: number) => normalizeItem(item, index))
        .filter(Boolean) as ExtractedScheduleItem[];

    return {
        items,
        rawResponse: data?.raw_response ?? data,
        engine: normalizeText(data?.engine ?? data?.model),
    };
};

export const getPrimaryExtractedSchedule = (result: ScheduleScanResult): ExtractedSchedule => {
    const item = result.items[0];
    if (!item) {
        return {
            course: '未能识别',
            room: '未能识别',
            time: '未能识别',
        };
    }

    return {
        course: item.courseName || item.courseCode || buildManualReviewLabel(item) || '待人工确认',
        room: item.room || (item.sourceBlock ? '待人工补充' : '未能识别'),
        time: buildTimeLabel(item) || (item.sourceBlock ? '待人工补充' : '未能识别'),
    };
};

export const scanScheduleFromImage = async (imageUri: string): Promise<ScheduleScanResult> => {
    try {
        const formData = new FormData();
        // @ts-ignore
        formData.append('file', {
            uri: imageUri,
            name: 'schedule.jpg',
            type: 'image/jpeg',
        });

        const response = await fetch(`${AI_BACKEND_URL}/extract/schedule`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        if (!response.ok) {
            throw new Error(`AI Backend Error: ${response.status}`);
        }

        const data = await response.json();
        return normalizeScheduleScanResponse(data);
    } catch (error) {
        console.error('[AI Service] Scan failed:', error);
        throw error;
    }
};

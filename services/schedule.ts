import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { Course } from '../types';
import { ExtractedScheduleItem, scanScheduleFromImage } from './ai-ocr';
import { supabase } from './supabase';

const SCHEDULE_SCREENSHOT_BUCKET = 'schedule-screenshots';

export interface ScheduleImportJob {
    id: string;
    userId: string;
    screenshotPath: string;
    status: 'uploaded' | 'processing' | 'processed' | 'partially_resolved' | 'completed' | 'failed';
    recognizedCount: number;
    unresolvedCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ScheduleImportItemRecord {
    id: string;
    importJobId: string;
    userId: string;
    sourceBlock?: string;
    extractedCourseName?: string;
    extractedCourseCode?: string;
    extractedTeacher?: string;
    extractedRoom?: string;
    extractedDayOfWeek?: number;
    extractedStartTime?: string;
    extractedEndTime?: string;
    extractedStartPeriod?: number;
    extractedEndPeriod?: number;
    extractedWeekText?: string;
    matchedCourseId?: string;
    matchMethod?: 'ocr_exact' | 'ocr_fuzzy' | 'manual_search' | 'manual_custom';
    confidence?: number;
    status: 'pending_review' | 'confirmed' | 'needs_manual_match' | 'ignored';
    reviewerNote?: string;
}

export interface UserScheduleEntry {
    id: string;
    userId: string;
    title: string;
    courseCode?: string;
    teacherName?: string;
    room?: string;
    dayOfWeek: number;
    startTime?: string;
    endTime?: string;
    startPeriod?: number;
    endPeriod?: number;
    weekText?: string;
    matchedCourseId?: string;
    source: 'ocr' | 'manual_search' | 'manual_custom';
    isActive: boolean;
}

const inferContentType = (uri: string): string => {
    const lower = uri.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
};

const inferExtension = (uri: string): string => {
    const match = uri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
    const ext = match?.[1];
    if (!ext || ext.length > 5) return 'jpg';
    return ext;
};

const mapImportItemRow = (row: any): ScheduleImportItemRecord => ({
    id: row.id,
    importJobId: row.import_job_id,
    userId: row.user_id,
    sourceBlock: row.source_block || undefined,
    extractedCourseName: row.extracted_course_name || undefined,
    extractedCourseCode: row.extracted_course_code || undefined,
    extractedTeacher: row.extracted_teacher || undefined,
    extractedRoom: row.extracted_room || undefined,
    extractedDayOfWeek: row.extracted_day_of_week || undefined,
    extractedStartTime: row.extracted_start_time || undefined,
    extractedEndTime: row.extracted_end_time || undefined,
    extractedStartPeriod: row.extracted_start_period || undefined,
    extractedEndPeriod: row.extracted_end_period || undefined,
    extractedWeekText: row.extracted_week_text || undefined,
    matchedCourseId: row.matched_course_id || undefined,
    matchMethod: row.match_method || undefined,
    confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
    status: row.status,
    reviewerNote: row.reviewer_note || undefined,
});

const mapEntryRow = (row: any): UserScheduleEntry => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    courseCode: row.course_code || undefined,
    teacherName: row.teacher_name || undefined,
    room: row.room || undefined,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time || undefined,
    endTime: row.end_time || undefined,
    startPeriod: row.start_period || undefined,
    endPeriod: row.end_period || undefined,
    weekText: row.week_text || undefined,
    matchedCourseId: row.matched_course_id || undefined,
    source: row.source,
    isActive: row.is_active,
});

const applyNullableFilter = (query: any, column: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') {
        return query.is(column, null);
    }
    return query.eq(column, value);
};

const updateImportItemAsConfirmed = async (params: {
    userId: string;
    item: ScheduleImportItemRecord;
    matchedCourse?: Course | null;
}) => {
    const { userId, item, matchedCourse } = params;

    const { error } = await supabase
        .from('schedule_import_items')
        .update({
            status: 'confirmed',
            matched_course_id: matchedCourse?.id || item.matchedCourseId || null,
            match_method: matchedCourse ? 'manual_search' : 'manual_custom',
            reviewer_note: matchedCourse ? `Matched with ${matchedCourse.code}` : 'Saved directly from OCR',
            updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('user_id', userId);

    if (error) throw error;
    await updateImportJobCounts(item.importJobId);
};

const findExistingActiveEntry = async (params: {
    userId: string;
    item: ScheduleImportItemRecord;
    matchedCourse?: Course | null;
    title: string;
}): Promise<UserScheduleEntry | null> => {
    const { userId, item, matchedCourse, title } = params;

    let query = supabase
        .from('user_schedule_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('title', title)
        .eq('day_of_week', item.extractedDayOfWeek!);

    query = applyNullableFilter(query, 'matched_course_id', matchedCourse?.id || item.matchedCourseId || null);
    query = applyNullableFilter(query, 'course_code', matchedCourse?.code || item.extractedCourseCode || null);
    query = applyNullableFilter(query, 'room', item.extractedRoom || null);
    query = applyNullableFilter(query, 'start_time', item.extractedStartTime || null);
    query = applyNullableFilter(query, 'end_time', item.extractedEndTime || null);
    query = applyNullableFilter(query, 'start_period', item.extractedStartPeriod || null);
    query = applyNullableFilter(query, 'end_period', item.extractedEndPeriod || null);

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapEntryRow(data) : null;
};

const buildImportItemPayload = (userId: string, importJobId: string, item: ExtractedScheduleItem, index: number) => ({
    user_id: userId,
    import_job_id: importJobId,
    row_index: index,
    source_block: item.sourceBlock || null,
    extracted_course_name: item.courseName || null,
    extracted_course_code: item.courseCode || null,
    extracted_teacher: item.teacher || null,
    extracted_room: item.room || null,
    extracted_day_of_week: item.dayOfWeek || null,
    extracted_start_time: item.startTime || null,
    extracted_end_time: item.endTime || null,
    extracted_start_period: item.startPeriod || null,
    extracted_end_period: item.endPeriod || null,
    extracted_week_text: item.weekText || null,
    confidence: typeof item.confidence === 'number' ? item.confidence : null,
    status: item.needsReview ? 'needs_manual_match' : 'pending_review',
    raw_item: item,
});

const uploadScheduleScreenshot = async (userId: string, imageUri: string): Promise<string> => {
    const ext = inferExtension(imageUri);
    const contentType = inferContentType(imageUri);
    const filePath = `${userId}/schedule_${Date.now()}.${ext}`;

    const base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
    });

    const arrayBuffer = decode(base64Data);
    const { error } = await supabase.storage
        .from(SCHEDULE_SCREENSHOT_BUCKET)
        .upload(filePath, arrayBuffer, {
            contentType,
            upsert: false,
        });

    if (error) throw error;
    return filePath;
};

const updateImportJobCounts = async (importJobId: string) => {
    const { data, error } = await supabase
        .from('schedule_import_items')
        .select('status', { count: 'exact' })
        .eq('import_job_id', importJobId);

    if (error) throw error;

    const items = data || [];
    const unresolvedCount = items.filter(item => item.status !== 'confirmed' && item.status !== 'ignored').length;
    const confirmedCount = items.filter(item => item.status === 'confirmed').length;
    const hasPending = items.some(item => item.status === 'pending_review' || item.status === 'needs_manual_match');

    const nextStatus = items.length === 0
        ? 'failed'
        : hasPending
            ? 'partially_resolved'
            : 'completed';

    await supabase
        .from('schedule_import_jobs')
        .update({
            status: nextStatus,
            recognized_count: confirmedCount,
            unresolved_count: unresolvedCount,
            updated_at: new Date().toISOString(),
        })
        .eq('id', importJobId);
};

export const importScheduleScreenshot = async (
    userId: string,
    imageUri: string
): Promise<{ job: ScheduleImportJob; items: ScheduleImportItemRecord[] }> => {
    let jobId: string | null = null;
    let screenshotPath = '';

    try {
        screenshotPath = await uploadScheduleScreenshot(userId, imageUri);

        const { data: jobRow, error: insertJobError } = await supabase
            .from('schedule_import_jobs')
            .insert({
                user_id: userId,
                screenshot_path: screenshotPath,
                status: 'processing',
                screenshot_meta: { localUri: imageUri },
            })
            .select('*')
            .single();

        if (insertJobError) throw insertJobError;
        jobId = jobRow.id;

        const scanResult = await scanScheduleFromImage(imageUri);
        const itemPayload = scanResult.items.map((item, index) => buildImportItemPayload(userId, jobId!, item, index));

        let insertedItems: any[] = [];
        if (itemPayload.length > 0) {
            const { data: itemRows, error: itemInsertError } = await supabase
                .from('schedule_import_items')
                .insert(itemPayload)
                .select('*');

            if (itemInsertError) throw itemInsertError;
            insertedItems = itemRows || [];
        }

        const unresolvedCount = insertedItems.filter(item => item.status !== 'pending_review').length;
        const { data: updatedJobRow, error: updateJobError } = await supabase
            .from('schedule_import_jobs')
            .update({
                status: insertedItems.length === 0 ? 'failed' : unresolvedCount > 0 ? 'partially_resolved' : 'processed',
                recognized_count: insertedItems.length,
                unresolved_count: unresolvedCount,
                ocr_engine: scanResult.engine || 'schedule-ocr',
                raw_ocr_payload: scanResult.rawResponse || {},
                error_message: insertedItems.length === 0 ? 'No course blocks were extracted from the screenshot.' : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', jobId)
            .select('*')
            .single();

        if (updateJobError) throw updateJobError;

        return {
            job: {
                id: updatedJobRow.id,
                userId: updatedJobRow.user_id,
                screenshotPath: updatedJobRow.screenshot_path,
                status: updatedJobRow.status,
                recognizedCount: updatedJobRow.recognized_count,
                unresolvedCount: updatedJobRow.unresolved_count,
                createdAt: updatedJobRow.created_at,
                updatedAt: updatedJobRow.updated_at,
            },
            items: insertedItems.map(mapImportItemRow),
        };
    } catch (error) {
        if (jobId) {
            await supabase
                .from('schedule_import_jobs')
                .update({
                    status: 'failed',
                    screenshot_path: screenshotPath || null,
                    error_message: error instanceof Error ? error.message : 'Unknown OCR error',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', jobId);
        }
        throw error;
    }
};

export const getUserScheduleEntries = async (userId: string): Promise<UserScheduleEntry[]> => {
    const { data, error } = await supabase
        .from('user_schedule_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })
        .order('start_period', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapEntryRow);
};

export const saveImportItemToSchedule = async (params: {
    userId: string;
    item: ScheduleImportItemRecord;
    matchedCourse?: Course | null;
    source?: 'ocr' | 'manual_search' | 'manual_custom';
}): Promise<UserScheduleEntry> => {
    const { userId, item, matchedCourse, source } = params;

    if (!item.extractedDayOfWeek) {
        throw new Error('Missing extracted day of week.');
    }

    const hasTime = Boolean(item.extractedStartTime && item.extractedEndTime);
    const hasPeriod = Boolean(item.extractedStartPeriod && item.extractedEndPeriod);
    const hasWeekText = Boolean(item.extractedWeekText);

    if (!hasTime && !hasPeriod && !hasWeekText) {
        throw new Error('Missing extracted class time.');
    }

    const title = matchedCourse?.name || item.extractedCourseName || item.extractedCourseCode;
    if (!title) {
        throw new Error('Missing course title.');
    }

    const existingEntry = await findExistingActiveEntry({ userId, item, matchedCourse, title });
    if (existingEntry) {
        await updateImportItemAsConfirmed({ userId, item, matchedCourse });
        return existingEntry;
    }

    const nextSource = source || (matchedCourse ? 'manual_search' : 'ocr');
    const { data: entryRow, error: insertError } = await supabase
        .from('user_schedule_entries')
        .insert({
            user_id: userId,
            import_job_id: item.importJobId,
            import_item_id: item.id,
            matched_course_id: matchedCourse?.id || item.matchedCourseId || null,
            source: nextSource,
            title,
            course_code: matchedCourse?.code || item.extractedCourseCode || null,
            teacher_name: item.extractedTeacher || matchedCourse?.instructor || null,
            room: item.extractedRoom || null,
            day_of_week: item.extractedDayOfWeek,
            start_time: item.extractedStartTime || null,
            end_time: item.extractedEndTime || null,
            start_period: item.extractedStartPeriod || null,
            end_period: item.extractedEndPeriod || null,
            week_text: item.extractedWeekText || null,
            note: item.sourceBlock || null,
        })
        .select('*')
        .single();

    if (insertError) {
        const message = typeof insertError.message === 'string' ? insertError.message : '';
        if (message.includes('user_schedule_entries_active_dedupe_idx')) {
            const dedupedEntry = await findExistingActiveEntry({ userId, item, matchedCourse, title });
            if (dedupedEntry) {
                await updateImportItemAsConfirmed({ userId, item, matchedCourse });
                return dedupedEntry;
            }
        }
        throw insertError;
    }

    await updateImportItemAsConfirmed({ userId, item, matchedCourse });

    return mapEntryRow(entryRow);
};

export const ignoreImportItem = async (userId: string, item: ScheduleImportItemRecord): Promise<void> => {
    const { error } = await supabase
        .from('schedule_import_items')
        .update({
            status: 'ignored',
            reviewer_note: 'Ignored by user',
            updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('user_id', userId);

    if (error) throw error;
    await updateImportJobCounts(item.importJobId);
};

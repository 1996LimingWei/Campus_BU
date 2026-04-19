import { supabase } from './supabase';

export type CalendarEventType = 'exam' | 'quiz' | 'assignment' | 'custom';

export interface UserCalendarEvent {
    id: string;
    userId: string;
    title: string;
    eventType: CalendarEventType;
    courseCode?: string;
    matchedCourseId?: string;
    eventDate: string; // YYYY-MM-DD
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
    location?: string;
    note?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateUserCalendarEventInput {
    userId: string;
    title: string;
    eventType: CalendarEventType;
    courseCode?: string;
    matchedCourseId?: string;
    eventDate: string; // YYYY-MM-DD
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
    location?: string;
    note?: string;
}

export interface UpdateUserCalendarEventInput {
    id: string;
    userId: string;
    title?: string;
    eventType?: CalendarEventType;
    courseCode?: string;
    matchedCourseId?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    note?: string;
    isActive?: boolean;
}

export interface GetUpcomingEventsOptions {
    days?: number; // Number of days to look ahead (default: 30)
    limit?: number; // Maximum number of events (default: 50)
    eventTypes?: CalendarEventType[]; // Filter by event types
}

const mapCalendarEventRow = (row: any): UserCalendarEvent => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    eventType: row.event_type,
    courseCode: row.course_code || undefined,
    matchedCourseId: row.matched_course_id || undefined,
    eventDate: row.event_date,
    startTime: row.start_time || undefined,
    endTime: row.end_time || undefined,
    location: row.location || undefined,
    note: row.note || undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/**
 * Get upcoming calendar events for a user
 */
export const getUpcomingUserCalendarEvents = async (
    userId: string,
    options: GetUpcomingEventsOptions = {}
): Promise<UserCalendarEvent[]> => {
    const { days = 30, limit = 50, eventTypes } = options;
    
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);
    
    let query = supabase
        .from('user_calendar_events')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('event_date', today.toISOString().split('T')[0])
        .lte('event_date', endDate.toISOString().split('T')[0])
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(limit);
    
    if (eventTypes && eventTypes.length > 0) {
        query = query.in('event_type', eventTypes);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Error fetching upcoming calendar events:', error);
        return [];
    }
    
    return (data || []).map(mapCalendarEventRow);
};

/**
 * Get calendar events for a specific date range
 */
export const getUserCalendarEventsInRange = async (
    userId: string,
    startDate: string,
    endDate: string
): Promise<UserCalendarEvent[]> => {
    const { data, error } = await supabase
        .from('user_calendar_events')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });
    
    if (error) {
        console.error('Error fetching calendar events in range:', error);
        return [];
    }
    
    return (data || []).map(mapCalendarEventRow);
};

/**
 * Check if a similar event already exists (for deduplication)
 */
const checkDuplicateEvent = async (
    userId: string,
    title: string,
    eventDate: string,
    courseCode?: string
): Promise<boolean> => {
    const { data, error } = await supabase
        .from('user_calendar_events')
        .select('id')
        .eq('user_id', userId)
        .eq('title', title)
        .eq('event_date', eventDate)
        .eq('is_active', true)
        .maybeSingle();
    
    if (error) {
        console.error('Error checking duplicate event:', error);
        return false;
    }
    
    return !!data;
};

/**
 * Create a new calendar event
 */
export const createUserCalendarEvent = async (
    input: CreateUserCalendarEventInput
): Promise<{ data: UserCalendarEvent | null; error: string | null }> => {
    // Validate required fields
    if (!input.title || !input.title.trim()) {
        return { data: null, error: 'Title is required' };
    }
    
    if (!input.eventDate) {
        return { data: null, error: 'Event date is required' };
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input.eventDate)) {
        return { data: null, error: 'Event date must be in YYYY-MM-DD format' };
    }
    
    // Validate time format if provided
    const timeRegex = /^\d{2}:\d{2}$/;
    if (input.startTime && !timeRegex.test(input.startTime)) {
        return { data: null, error: 'Start time must be in HH:MM format' };
    }
    if (input.endTime && !timeRegex.test(input.endTime)) {
        return { data: null, error: 'End time must be in HH:MM format' };
    }
    
    // Check for duplicates
    const isDuplicate = await checkDuplicateEvent(
        input.userId,
        input.title.trim(),
        input.eventDate,
        input.courseCode
    );
    
    if (isDuplicate) {
        return { data: null, error: 'A similar event already exists for this date' };
    }
    
    const { data, error } = await supabase
        .from('user_calendar_events')
        .insert({
            user_id: input.userId,
            title: input.title.trim(),
            event_type: input.eventType,
            course_code: input.courseCode || null,
            matched_course_id: input.matchedCourseId || null,
            event_date: input.eventDate,
            start_time: input.startTime || null,
            end_time: input.endTime || null,
            location: input.location || null,
            note: input.note || null,
            is_active: true,
        })
        .select()
        .single();
    
    if (error) {
        console.error('Error creating calendar event:', error);
        // Check if it's a unique constraint violation
        if (error.code === '23505') {
            return { data: null, error: 'A similar event already exists for this date' };
        }
        return { data: null, error: error.message };
    }
    
    return { data: mapCalendarEventRow(data), error: null };
};

/**
 * Update an existing calendar event
 */
export const updateUserCalendarEvent = async (
    input: UpdateUserCalendarEventInput
): Promise<{ data: UserCalendarEvent | null; error: string | null }> => {
    const updateData: any = {};
    
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.eventType !== undefined) updateData.event_type = input.eventType;
    if (input.courseCode !== undefined) updateData.course_code = input.courseCode || null;
    if (input.matchedCourseId !== undefined) updateData.matched_course_id = input.matchedCourseId || null;
    if (input.eventDate !== undefined) updateData.event_date = input.eventDate;
    if (input.startTime !== undefined) updateData.start_time = input.startTime || null;
    if (input.endTime !== undefined) updateData.end_time = input.endTime || null;
    if (input.location !== undefined) updateData.location = input.location || null;
    if (input.note !== undefined) updateData.note = input.note || null;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;
    
    const { data, error } = await supabase
        .from('user_calendar_events')
        .update(updateData)
        .eq('id', input.id)
        .eq('user_id', input.userId)
        .select()
        .single();
    
    if (error) {
        console.error('Error updating calendar event:', error);
        return { data: null, error: error.message };
    }
    
    return { data: mapCalendarEventRow(data), error: null };
};

/**
 * Delete (soft delete) a calendar event
 */
export const deleteUserCalendarEvent = async (
    eventId: string,
    userId: string
): Promise<{ success: boolean; error: string | null }> => {
    const { error } = await supabase
        .from('user_calendar_events')
        .update({ is_active: false })
        .eq('id', eventId)
        .eq('user_id', userId);
    
    if (error) {
        console.error('Error deleting calendar event:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, error: null };
};

/**
 * Get a single calendar event by ID
 */
export const getUserCalendarEventById = async (
    eventId: string,
    userId: string
): Promise<UserCalendarEvent | null> => {
    const { data, error } = await supabase
        .from('user_calendar_events')
        .select('*')
        .eq('id', eventId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
    
    if (error || !data) {
        console.error('Error fetching calendar event:', error);
        return null;
    }
    
    return mapCalendarEventRow(data);
};

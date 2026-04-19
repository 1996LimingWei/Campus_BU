-- Migration: Add user_calendar_events table for one-time calendar events (exams, quizzes, etc.)
-- Created at: 20260419153458

-- Create the user_calendar_events table
CREATE TABLE IF NOT EXISTS user_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('exam', 'quiz', 'assignment', 'custom')),
    course_code TEXT,
    matched_course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_calendar_events_user_id ON user_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_calendar_events_event_date ON user_calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_user_calendar_events_user_date ON user_calendar_events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_user_calendar_events_course_code ON user_calendar_events(course_code);

-- Create a unique constraint to prevent duplicate events for the same user
-- (same title, date, and course_code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_calendar_events_unique 
ON user_calendar_events(user_id, title, event_date, COALESCE(course_code, ''))
WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE user_calendar_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy: Users can only view their own events
CREATE POLICY "Users can view own calendar events"
ON user_calendar_events
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can only insert their own events
CREATE POLICY "Users can insert own calendar events"
ON user_calendar_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own events
CREATE POLICY "Users can update own calendar events"
ON user_calendar_events
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own events
CREATE POLICY "Users can delete own calendar events"
ON user_calendar_events
FOR DELETE
USING (auth.uid() = user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before update
DROP TRIGGER IF EXISTS trigger_update_user_calendar_events_updated_at ON user_calendar_events;
CREATE TRIGGER trigger_update_user_calendar_events_updated_at
    BEFORE UPDATE ON user_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_user_calendar_events_updated_at();

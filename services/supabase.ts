import { createClient } from '@supabase/supabase-js';
import storage from '../lib/storage';

// Single-database mode: read Expo env vars first so the app and scripts stay
// aligned, while keeping the current production project as a fallback.
const SUPABASE_URL =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
    || 'https://fcbsekidlijtidqzkddx.supabase.co';
const SUPABASE_KEY =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storage: storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

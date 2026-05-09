
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fcbsekidlijtidqzkddx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function dumpBuildings() {
    const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('id');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

dumpBuildings();

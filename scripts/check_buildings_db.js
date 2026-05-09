const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fcbsekidlijtidqzkddx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBuildings() {
    const { data, error } = await supabase.from('buildings').select('name').limit(10);
    if (error) {
        console.error(error);
        return;
    }
    console.log('Sample Building Names from DB:');
    data.forEach(b => console.log(`- "${b.name}"`));
}

checkBuildings();

/**
 * Migratie script om week-ID's te converteren van ISO week naar custom week nummering
 * 
 * Dit script:
 * 1. Haalt alle weekly_logs op met hun eerste datum
 * 2. Berekent de nieuwe custom week-ID op basis van die datum
 * 3. Update de week_id in de database als deze anders is
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const envFile = readFileSync(envPath, 'utf-8');
    const envVars = {};
    
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.warn('Could not load .env.local, using process.env');
    return {};
  }
}

const env = loadEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get the first Monday of a given year
 */
function getFirstMondayOfYear(year) {
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  if (dayOfWeek === 1) {
    return jan1;
  } else if (dayOfWeek === 0) {
    return new Date(year, 0, 2);
  } else {
    const daysUntilMonday = 8 - dayOfWeek;
    const result = new Date(jan1);
    result.setDate(result.getDate() + daysUntilMonday);
    return result;
  }
}

/**
 * Get start of week (Monday) for a date
 */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get custom week number for a date
 */
function getCustomWeek(date) {
  const weekStart = startOfWeek(date);
  const weekStartYear = weekStart.getFullYear();
  
  const firstMonday = getFirstMondayOfYear(weekStartYear);
  const daysDiff = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  
  let weekNumber = Math.floor(daysDiff / 7) + 1;
  
  // Check if we're in week 53 of current year
  const week53Start = new Date(firstMonday);
  week53Start.setDate(week53Start.getDate() + 52 * 7);
  
  if (weekStart.getTime() >= week53Start.getTime()) {
    const week53End = new Date(week53Start);
    week53End.setDate(week53End.getDate() + 6);
    const week53EndYear = week53End.getFullYear();
    
    if (week53EndYear === weekStartYear || (week53EndYear === weekStartYear + 1 && week53End.getMonth() === 0)) {
      return 53;
    }
    
    // Check if it belongs to previous year's week 53
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearWeek53Start = new Date(prevYearFirstMonday);
    prevYearWeek53Start.setDate(prevYearWeek53Start.getDate() + 52 * 7);
    
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = new Date(prevYearWeek53Start);
      prevYearWeek53End.setDate(prevYearWeek53End.getDate() + 6);
      const prevYearWeek53EndYear = prevYearWeek53End.getFullYear();
      
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && prevYearWeek53End.getMonth() === 0)) {
        return 53;
      }
    }
    return 1;
  }
  
  // If weekStart is before firstMonday, it belongs to previous year
  if (daysDiff < 0) {
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearDaysDiff = Math.floor((weekStart.getTime() - prevYearFirstMonday.getTime()) / (1000 * 60 * 60 * 24));
    const prevYearWeekNumber = Math.floor(prevYearDaysDiff / 7) + 1;
    
    // Check if it's week 53 of previous year
    const prevYearWeek53Start = new Date(prevYearFirstMonday);
    prevYearWeek53Start.setDate(prevYearWeek53Start.getDate() + 52 * 7);
    
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = new Date(prevYearWeek53Start);
      prevYearWeek53End.setDate(prevYearWeek53End.getDate() + 6);
      const prevYearWeek53EndYear = prevYearWeek53End.getFullYear();
      
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && prevYearWeek53End.getMonth() === 0)) {
        return 53;
      }
    }
    
    return Math.min(Math.max(prevYearWeekNumber, 1), 53);
  }
  
  return Math.min(weekNumber, 53);
}

/**
 * Get custom week year for a date
 */
function getCustomWeekYear(date) {
  const weekStart = startOfWeek(date);
  const weekStartYear = weekStart.getFullYear();
  
  const firstMonday = getFirstMondayOfYear(weekStartYear);
  const daysDiff = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearWeek53Start = new Date(prevYearFirstMonday);
    prevYearWeek53Start.setDate(prevYearWeek53Start.getDate() + 52 * 7);
    
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = new Date(prevYearWeek53Start);
      prevYearWeek53End.setDate(prevYearWeek53End.getDate() + 6);
      const prevYearWeek53EndYear = prevYearWeek53End.getFullYear();
      
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && prevYearWeek53End.getMonth() === 0)) {
        return prevYear;
      }
    }
    return prevYear;
  }
  
  return weekStartYear;
}

async function migrateWeekIds() {
  console.log('Starting week ID migration...\n');
  
  // Fetch all weekly logs with their first date
  const { data: logs, error: fetchError } = await supabase
    .from('weekly_logs')
    .select(`
      id,
      week_id,
      daily_logs!inner(date)
    `)
    .order('week_id', { ascending: false });
  
  if (fetchError) {
    console.error('Error fetching logs:', fetchError);
    process.exit(1);
  }
  
  console.log(`Found ${logs.length} weekly logs to check\n`);
  
  const updates = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const log of logs) {
    processed++;
    
    // Get the first date from daily_logs
    const dailyLogs = log.daily_logs || [];
    if (dailyLogs.length === 0) {
      console.log(`⚠️  Skipping log ${log.id} (${log.week_id}): No daily logs found`);
      skipped++;
      continue;
    }
    
    // Find the earliest date
    const dates = dailyLogs.map(dl => new Date(dl.date)).sort((a, b) => a - b);
    const firstDate = dates[0];
    
    // Calculate new week ID
    const weekStart = startOfWeek(firstDate);
    const newYear = getCustomWeekYear(weekStart);
    const newWeek = getCustomWeek(weekStart);
    const newWeekId = `${newYear}-${newWeek}`;
    
    // Only update if different
    if (log.week_id !== newWeekId) {
      updates.push({
        id: log.id,
        oldWeekId: log.week_id,
        newWeekId: newWeekId,
        firstDate: firstDate.toISOString().split('T')[0]
      });
      updated++;
      
      console.log(`📝 ${log.week_id} → ${newWeekId} (first date: ${firstDate.toISOString().split('T')[0]})`);
    } else {
      skipped++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   To update: ${updated}`);
  console.log(`   No change: ${skipped}`);
  
  if (updates.length === 0) {
    console.log('\n✅ No updates needed!');
    return;
  }
  
  console.log(`\n🔄 Updating ${updates.length} week IDs...\n`);
  
  // Update in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    for (const update of batch) {
      const { error: updateError } = await supabase
        .from('weekly_logs')
        .update({ week_id: update.newWeekId })
        .eq('id', update.id);
      
      if (updateError) {
        console.error(`❌ Error updating ${update.id}:`, updateError);
      } else {
        console.log(`✅ Updated ${update.oldWeekId} → ${update.newWeekId}`);
      }
    }
    
    // Small delay between batches
    if (i + batchSize < updates.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`\n✅ Migration completed! Updated ${updates.length} week IDs.`);
}

// Run migration
migrateWeekIds()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

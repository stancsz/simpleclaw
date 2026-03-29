/* SUPABASE_ONLY_BEGIN */
-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the swarms.heartbeat() function to run every 30 minutes
-- This calls the function created in 002_heartbeat.sql
SELECT cron.schedule(
    'swarms-continuous-mode-heartbeat',
    '*/30 * * * *',
    'SELECT swarms.heartbeat()'
);
/* SUPABASE_ONLY_END */

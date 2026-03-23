import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

// Bun automatically loads .env files
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  console.log(chalk.blue('🚀 Starting Sovereign Motherboard Supabase Migration...'));

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(chalk.red('❌ Missing environment variables.'));
    console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file.');
    process.exit(1);
  }

  console.log(chalk.gray(`Connecting to Supabase at: ${SUPABASE_URL}`));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Verify connection
  const { error: healthError } = await supabase.from('orchestrator_sessions').select('id').limit(1).catch(() => ({ error: null }));
  if (healthError && healthError.code !== '42P01') { // 42P01 is undefined_table
    console.error(chalk.red('❌ Connection failed.'));
    console.error(healthError.message);
    process.exit(1);
  }

  console.log(chalk.green('✅ Connected successfully.'));

  const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(chalk.red(`❌ Schema file not found at ${schemaPath}`));
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log(chalk.blue('Applying schema migrations...'));

  // Supabase REST API does not support executing raw SQL scripts directly via the JS client.
  // We recommend using the Supabase CLI, but since we are asked to build a CLI tool using supabase-js,
  // we can use a temporary RPC function to execute the raw SQL or suggest using postgres client.
  // However, we can't create the RPC without SQL access!
  // We'll instruct the user to run it via SQL editor, or we could use the 'postgres' package here.
  // Let's print out instructions or execute if an RPC exists.

  // Try to use a pre-existing RPC 'exec_sql' if available
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql: schemaSql });

  if (rpcError) {
    console.log(chalk.yellow('⚠️  Direct SQL execution via RPC is not available.'));
    console.log(chalk.white('To complete the migration, please run the following SQL script in your Supabase SQL Editor:'));
    console.log(chalk.gray('--------------------------------------------------'));
    console.log(schemaSql);
    console.log(chalk.gray('--------------------------------------------------'));
    console.log(chalk.yellow('Or run this script via the Supabase CLI:'));
    console.log(chalk.white('supabase db push'));
    console.log('');
  } else {
    console.log(chalk.green('✅ Schema migrations applied successfully via RPC.'));
  }

  console.log(chalk.blue('Verifying Motherboard Integrity...'));

  const { data: integrityData, error: integrityError } = await supabase.schema('swarms').rpc('verify_motherboard_integrity');

  if (integrityError) {
    console.error(chalk.red('❌ Integrity check failed. Please ensure the swarms.verify_motherboard_integrity function exists and the swarms schema is exposed in your Supabase API settings.'));
    console.error(integrityError.message);
  } else {
    console.log(chalk.green('✅ Integrity check passed:'));
    console.log(integrityData);
  }

  console.log(chalk.blue('Migration tool completed.'));
}

runMigration().catch(console.error);

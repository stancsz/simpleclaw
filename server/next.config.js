/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google-cloud/functions-framework', 'yaml', 'dotenv', 'openai', 'zod', 'better-sqlite3', '@supabase/supabase-js', 'stripe']
}

module.exports = nextConfig

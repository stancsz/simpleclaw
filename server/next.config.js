/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google-cloud/functions-framework', 'yaml', 'dotenv', 'openai', 'stripe', 'zod', 'better-sqlite3', '@supabase/supabase-js']
}

module.exports = nextConfig

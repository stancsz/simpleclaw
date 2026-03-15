import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { db, LOCAL_USER_ID, LOCAL_USER_EMAIL } from '../sqlite'

export async function createClient() {
  if (process.env.LOCAL_MODE === 'true') {
    return {
      auth: {
        getUser: async () => ({
          data: { user: { id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL } },
          error: null,
        }),
        signInWithOtp: async () => ({ data: {}, error: null }),
      },
      from: (table: string) => ({
        select: (columns: string) => ({
          async then(resolve: any) {
            if (table === 'bots') {
              const rows = db.prepare('SELECT * FROM bots WHERE user_id = ?').all(LOCAL_USER_ID);
              // Parse config strings back to objects
              const parsedRows = rows.map((row: any) => ({
                ...row,
                config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
              }));
              resolve({ data: parsedRows, error: null });
            } else {
              resolve({ data: [], error: null });
            }
          }
        }),
        insert: (data: any) => ({
          async then(resolve: any) {
            if (table === 'bots') {
              const insertData = {
                ...data,
                config: JSON.stringify(data.config)
              };
              db.prepare('INSERT INTO bots (user_id, name, platform, config, status) VALUES (?, ?, ?, ?, ?)')
                .run(insertData.user_id, insertData.name, insertData.platform, insertData.config, insertData.status);
              resolve({ data, error: null });
            } else {
              resolve({ data: null, error: null });
            }
          }
        })
      })
    } as any;
  }

  const cookieStore = await cookies()
  // ... rest of the original code

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
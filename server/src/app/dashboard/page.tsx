import CreateBotForm from '@/components/CreateBotForm'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  // Fetch user's bots
  const { data: bots } = await supabase.from('bots').select('*')

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Management Cluster</h1>
        <div className="user-info">Logged in as {user.email}</div>
      </header>

      <main className="dashboard-main">
        <section className="bots-list-section">
          <h2>Your Bots</h2>
          {bots && bots.length > 0 ? (
            <ul className="bots-list">
              {bots.map((bot) => (
                <li key={bot.id} className="bot-item">
                  <div className="bot-info">
                    <strong>{bot.name || 'Unnamed Bot'}</strong> - {bot.platform}
                  </div>
                  <div className={`status ${bot.status || 'unknown'}`}>
                    {bot.status || 'Unknown'}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No bots found. Create one below.</p>
          )}
        </section>

        <section className="create-bot-section">
          <h2>Create New Bot</h2>
          <CreateBotForm />
        </section>
      </main>
    </div>
  )
}
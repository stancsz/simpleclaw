import { loginWithMagicLink } from './actions'

type SearchParams = {
  [key: string]: string | string[] | undefined
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const isSent = resolvedSearchParams?.status === 'sent'

  return (
    <div className="login-container">
      {isSent ? (
        <div className="form-container" style={{ textAlign: 'center' }}>
          <h2>Check Your Email</h2>
          <p>We&apos;ve sent you a magic link to sign in securely. No password required.</p>
        </div>
      ) : (
        <form className="form-container">
          <h2>Login to SimpleClaw</h2>
          <p>Sign in instantly via magic link.</p>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input 
              className="input-field" 
              id="email" 
              name="email" 
              type="email" 
              placeholder="you@example.com" 
              defaultValue="admin@local.test"
            />
          </div>
          <div className="button-group">
            <button className="btn-primary" formAction={loginWithMagicLink}>Send Magic Link</button>
          </div>
        </form>
      )}
    </div>
  )
}
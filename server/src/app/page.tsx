import Link from 'next/link';

export default function Home() {
  return (
    <div className="login-container">
      <div className="form-container" style={{ textAlign: 'center' }}>
        <h1>SimpleClaw</h1>
        <p>The agentic management cluster for your bots.</p>
        
        <div className="button-group" style={{ justifyContent: 'center', marginTop: '2rem' }}>
          <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}

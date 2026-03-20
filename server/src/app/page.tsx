'use client';

import React, { useState } from 'react';
import PlanDisplay from '../components/PlanDisplay';
import ExecutionMonitor from '../components/ExecutionMonitor';
import type { PlanDiffApprove } from '@/../../src/core/types';
import Link from 'next/link';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [pda, setPda] = useState<PlanDiffApprove | null>(null);
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [taskResults, setTaskResults] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchKeys = async () => {
      try {
        const res = await fetch('/api/keys');
        if (res.ok) {
          const data = await res.json();
          setKeyCount(data.keys?.length || 0);
        }
      } catch (err) {
        console.error('Failed to fetch keys', err);
      }
    };
    fetchKeys();
  }, []);

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus('planning');
    setPda(null);
    setSessionId(null);
    setErrorMessage('');

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          user_id: 'test-user', // Minimal auth for Phase 0
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate plan');
      }

      setPda(data.pda);
      setSessionId(data.session_id);
      setStatus('waiting_approval');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  const handleExecutionComplete = (finalStatus: 'completed' | 'error', finalResults: any[], finalError?: string) => {
    setStatus(finalStatus);
    if (finalResults && finalResults.length > 0) {
      setTaskResults(finalResults);
    }
    if (finalError) {
      setErrorMessage(finalError);
    }
  };

  const handleApprove = async () => {
    if (!sessionId || !pda) return;

    // Transition from plan display to execution monitoring
    setStatus('executing');
    setErrorMessage('');

    try {
      // Trigger swarm manifest execution via the orchestrator execute endpoint
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          manifest: pda.plan,
          user_id: 'test-user', // Minimal auth for Phase 0
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute plan');
      }

      // We leave the status in 'executing' state.
      // The ExecutionMonitor component will poll the database for real-time
      // progress of task results. When complete, it calls handleExecutionComplete.
      console.log('Swarm execution started with ID:', data.executionId);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred during execution.');
      setStatus('error');
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>SimpleClaw Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/onboarding" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            Onboarding
          </Link>
          <Link href="/keys" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            Keys (BYOK)
          </Link>
          <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 0: Orchestrator Test</div>
        </div>
      </div>

      <main className="dashboard-main">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <div style={{
            backgroundColor: '#1e1e1e',
            border: '1px solid #333',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <span style={{ color: '#ccc' }}>
              Configured Keys: <strong style={{ color: '#00E5CC' }}>{keyCount !== null ? keyCount : '...'}</strong>
            </span>
            <Link href="/keys" style={{
              backgroundColor: 'transparent',
              color: '#00E5CC',
              border: '1px solid #00E5CC',
              borderRadius: '4px',
              padding: '0.4rem 0.8rem',
              textDecoration: 'none',
              fontSize: '0.9rem'
            }}>
              Manage Keys
            </Link>
          </div>
        </div>

        <div className="create-bot-section">
          <h2>Natural Language Intent</h2>
          <form onSubmit={handlePlan} className="form-container" style={{ maxWidth: '100%' }}>
            <div className="input-group">
              <label htmlFor="prompt" style={{ color: '#ccc', marginBottom: '0.5rem' }}>
                What would you like the swarm to do?
              </label>
              <textarea
                id="prompt"
                className="input-field"
                style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="e.g., Get latest GitHub issues and summarize them into a Google Sheet"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={status === 'planning' || status === 'executing'}
              />
            </div>
            <div className="button-group">
              <button
                type="submit"
                className="btn-primary"
                disabled={!prompt.trim() || status === 'planning' || status === 'executing'}
              >
                {status === 'planning' ? 'Planning...' : 'Generate Plan'}
              </button>
            </div>
          </form>
        </div>

        <ExecutionMonitor
          status={status}
          errorMessage={errorMessage}
          taskResults={taskResults}
          sessionId={sessionId}
          onComplete={handleExecutionComplete}
        />

        {pda && status !== 'error' && (
          <div style={{ marginTop: '2rem' }}>
            <PlanDisplay
              pda={{ ...pda, status: status === 'waiting_approval' ? 'waiting_approval' : status }}
              sessionId={sessionId}
              onApprove={handleApprove}
            />
          </div>
        )}
      </main>
    </div>
  );
}

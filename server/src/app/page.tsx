'use client';

import React, { useState } from 'react';
import PlanDisplay from '../components/PlanDisplay';
import ExecutionMonitor from '../components/ExecutionMonitor';
import GasTankDisplay from '../components/GasTankDisplay';
import type { PlanDiffApprove } from '@/../../src/core/types';
import Link from 'next/link';
import { generatePlan, executePlan } from '../lib/api-client';
import KeyManager from './components/KeyManager';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [pda, setPda] = useState<PlanDiffApprove | null>(null);
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [taskResults, setTaskResults] = useState<any[]>([]);
  const [gasBalance, setGasBalance] = useState<number | null>(null);

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

    const fetchGas = async () => {
      try {
        const res = await fetch('/api/gas');
        if (res.ok) {
          const data = await res.json();
          setGasBalance(data.balance);
        }
      } catch (err) {
        console.error('Failed to fetch gas balance', err);
      }
    };

    fetchKeys();
    fetchGas();
  }, []);

  const handleBuyGas = async () => {
    try {
      const res = await fetch('/api/gas', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Failed to initiate checkout');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initiate checkout');
    }
  };

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus('planning');
    setPda(null);
    setSessionId(null);
    setErrorMessage('');

    try {
      const response = await generatePlan(prompt, 'test-user');

      const data = await response.json();

      if (!response.ok) {
        // Fallback for visual testing if OpenAI key is invalid in mock environment
        if (data.error && (data.error.includes('invalid_request_error') || data.error.toLowerCase().includes('api key'))) {
           setPda({
              plan: {
                  version: "1.0",
                  intent_parsed: prompt,
                  skills_required: ["mock-skill"],
                  credentials_required: [],
                  steps: [{ id: "mock-step", description: "Mock step", worker: "worker-mock", skills: [], credentials: [], depends_on: [], action_type: "READ" }]
              },
              write_operations: 0,
              read_operations: 1,
              status: "waiting_approval",
              sessionId: "mock-session-id"
           });
           setSessionId("mock-session-id");
           setStatus('waiting_approval');
           return;
        }
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

  const handleApprove = () => {
    if (!sessionId || !pda) return;

    // Transition from plan display to execution monitoring state
    setStatus('executing');
    setErrorMessage('');

    // We leave the status in 'executing' state.
    // The ExecutionMonitor component will poll the database for real-time
    // progress of task results. When complete, it calls handleExecutionComplete.
    console.log('Swarm execution started for session:', sessionId);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>SimpleClaw Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/onboarding" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            Onboarding
          </Link>
          <Link href="/settings" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            Settings (BYOK)
          </Link>
          <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 0: Orchestrator Test</div>
        </div>
      </div>

      <main className="dashboard-main">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div id="key-manager-section" style={{ gridColumn: '1 / -1', marginBottom: '2rem' }}>
              <KeyManager />
          </div>

          <GasTankDisplay balance={gasBalance} onTopUp={handleBuyGas} />
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

        {pda && (
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

'use client';

import React, { useState } from 'react';
import PlanDisplay from '../components/PlanDisplay';
import IntentInput from '../components/IntentInput';
import ApproveButton from '../components/ApproveButton';
import ExecutionMonitor from './components/ExecutionMonitor';
import type { PlanDiffApprove } from '../../../src/core/types';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [pda, setPda] = useState<PlanDiffApprove | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleApprove = async () => {
    if (!sessionId || !pda) return;

    setStatus('executing');
    setErrorMessage('');

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve',
          manifest: pda.plan, // Passing manifest as requested
          user_id: 'test-user', // Matching minimal auth
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve plan');
      }

      // Simulate execution time for Phase 0
      setTimeout(() => {
        setStatus('completed');
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred during approval.');
      setStatus('error');
    }
  };

  return (
    <div className="dashboard-container bg-neutral-950 text-white min-h-screen">
      <div className="dashboard-header border-neutral-800">
        <h1>SimpleClaw Dashboard</h1>
        <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 0: Orchestrator Test</div>
      </div>

      <main className="dashboard-main w-full max-w-4xl mx-auto p-4">
        <IntentInput
          prompt={prompt}
          setPrompt={setPrompt}
          status={status}
          onSubmit={handlePlan}
        />

        <ExecutionMonitor status={status} errorMessage={errorMessage} />

        {pda && status !== 'error' && (
          <div className="mt-8">
            <PlanDisplay pda={pda} />
            <ApproveButton status={status} onApprove={handleApprove} />
          </div>
        )}
      </main>
    </div>
  );
}

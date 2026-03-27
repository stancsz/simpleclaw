'use client';

import React, { useState } from 'react';
import type { PlanDiffApprove, Task } from '../../../src/core/types';

interface PlanDisplayProps {
  pda: PlanDiffApprove;
  sessionId?: string | null;
  onApprove?: () => void;
}

export default function PlanDisplay({ pda, sessionId, onApprove }: PlanDisplayProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');

  const handleApproveClick = async () => {
    if (!sessionId || !pda || !pda.plan) return;

    setIsExecuting(true);
    setError('');

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
          session_id: sessionId,
          user_id: 'test-user',
          manifest: pda.plan,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start execution');
      }

      if (onApprove) {
        onApprove();
      }
    } catch (err: any) {
      console.error('Error starting execution:', err);
      setError(err.message || 'An error occurred starting execution.');
    } finally {
      setIsExecuting(false);
    }
  };
  if (!pda || !pda.plan || !pda.plan.steps) {
    return null;
  }

  const { plan, write_operations, read_operations } = pda;

  return (
    <div className="plan-display-container" style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--input-bg)' }}>
      <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        Execution Plan (v{plan.version})
      </h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(22, 163, 74, 0.2)', color: '#86efac', borderRadius: '4px', border: '1px solid #16a34a' }}>
          <strong>READ:</strong> {read_operations}
        </div>
        <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(220, 38, 38, 0.2)', color: '#fca5a5', borderRadius: '4px', border: '1px solid #dc2626' }}>
          <strong>WRITE:</strong> {write_operations}
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Skills Required</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {plan.skills_required.map((skill) => (
            <span key={skill} style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.8rem' }}>
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>DAG Steps</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {plan.steps.map((step: Task, index: number) => (
            <div key={step.id} style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.1rem' }}>Step {index + 1}: {step.id}</strong>
                <span style={{
                  padding: '0.2rem 0.5rem',
                  backgroundColor: step.action_type === 'WRITE' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(22, 163, 74, 0.2)',
                  color: step.action_type === 'WRITE' ? '#fca5a5' : '#86efac',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  border: `1px solid ${step.action_type === 'WRITE' ? '#dc2626' : '#16a34a'}`
                }}>
                  {step.action_type}
                </span>
              </div>

              <p style={{ margin: '0.5rem 0', color: '#ccc', fontSize: '0.9rem' }}>{step.description}</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', fontSize: '0.85rem', marginTop: '1rem' }}>
                <strong style={{ color: '#888' }}>Worker:</strong>
                <span>{step.worker}</span>

                <strong style={{ color: '#888' }}>Skills:</strong>
                <span>{step.skills.join(', ') || 'None'}</span>

                <strong style={{ color: '#888' }}>Credentials:</strong>
                <span>{step.credentials.length > 0 ? step.credentials.map(c => `[MASKED_${c}]`).join(', ') : 'None'}</span>

                <strong style={{ color: '#888' }}>Depends On:</strong>
                <span>
                  {step.depends_on && step.depends_on.length > 0 ? (
                    step.depends_on.map(dep => (
                      <span key={dep} style={{ padding: '0.1rem 0.4rem', backgroundColor: '#333', borderRadius: '3px', marginRight: '0.3rem' }}>
                        {dep}
                      </span>
                    ))
                  ) : 'None (Root Node)'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(pda.status === 'waiting_approval' || pda.status === 'executing') && (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>
          {error && <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{error}</div>}
          <button
            onClick={handleApproveClick}
            disabled={pda.status === 'executing' || isExecuting}
            className="btn-primary"
            style={{ backgroundColor: (pda.status === 'executing' || isExecuting) ? '#4b5563' : '#16a34a', padding: '1rem 2rem', fontSize: '1.1rem', cursor: (pda.status === 'executing' || isExecuting) ? 'not-allowed' : 'pointer' }}
          >
            {(pda.status === 'executing' || isExecuting) ? 'Executing...' : 'Approve & Execute Plan'}
          </button>
        </div>
      )}
    </div>
  );
}

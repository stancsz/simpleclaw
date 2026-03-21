'use client';

import React, { useEffect, useState } from 'react';

interface ExecutionMonitorProps {
  status: 'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error';
  errorMessage?: string;
  taskResults?: any[];
  sessionId?: string | null;
  onComplete?: (finalStatus: 'completed' | 'error', finalResults: any[], finalError?: string) => void;
}

export default function ExecutionMonitor({ status, errorMessage, taskResults, sessionId, onComplete }: ExecutionMonitorProps) {
  const [dots, setDots] = useState('');
  const [polledResults, setPolledResults] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'planning' || status === 'executing') {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);
      return () => clearInterval(interval);
    } else {
      setDots('');
    }
  }, [status]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const fetchResults = async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`/api/results?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            setPolledResults(data.results);
          }
          if (status === 'executing') {
             if (data.sessionStatus === 'completed') {
                 onComplete?.('completed', data.results);
             } else if (data.sessionStatus === 'error') {
                 onComplete?.('error', data.results, 'Execution failed. Check results for details.');
             }
          }
        }
      } catch (err) {
        console.error("Failed to fetch task results", err);
      }
    };

    if (status === 'executing') {
      // Poll faster to show real-time updates more responsively
      interval = setInterval(fetchResults, 1000);
    } else if (status === 'completed' || status === 'error') {
      fetchResults();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, sessionId, onComplete]);

  if (status === 'idle') return null;

  const getStatusDisplay = () => {
    switch (status) {
      case 'planning':
        return {
          text: `Planning DAG${dots}`,
          color: '#60a5fa',
          bg: 'rgba(96, 165, 250, 0.1)',
          border: '#3b82f6',
        };
      case 'waiting_approval':
        return {
          text: 'Waiting for Approval',
          color: '#fbbf24',
          bg: 'rgba(251, 191, 36, 0.1)',
          border: '#f59e0b',
        };
      case 'executing':
        return {
          text: `Executing Workers${dots}`,
          color: '#c084fc',
          bg: 'rgba(192, 132, 252, 0.1)',
          border: '#a855f7',
        };
      case 'completed':
        return {
          text: 'Execution Completed',
          color: '#86efac',
          bg: 'rgba(34, 197, 94, 0.1)',
          border: '#16a34a',
        };
      case 'error':
        return {
          text: errorMessage || 'An error occurred',
          color: '#fca5a5',
          bg: 'rgba(239, 68, 68, 0.1)',
          border: '#dc2626',
        };
      default:
        return {
          text: status,
          color: 'var(--text-color)',
          bg: 'var(--input-bg)',
          border: 'var(--border-color)',
        };
    }
  };

  const display = getStatusDisplay();

  const combinedResults = polledResults.length > 0 ? polledResults : (taskResults || []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return { bg: 'rgba(34, 197, 94, 0.1)', text: '#86efac', border: '#22c55e' };
      case 'error':
      case 'failed':
        return { bg: 'rgba(239, 68, 68, 0.1)', text: '#fca5a5', border: '#ef4444' };
      case 'running':
      case 'booting':
        return { bg: 'rgba(96, 165, 250, 0.1)', text: '#93c5fd', border: '#3b82f6' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.1)', text: '#d1d5db', border: '#9ca3af' };
    }
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div
        style={{
          padding: '1rem',
          borderRadius: '8px',
          border: `1px solid ${display.border}`,
          backgroundColor: display.bg,
          color: display.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '1.1rem',
          minHeight: '60px',
        }}
      >
        {display.text}
      </div>

      {combinedResults && combinedResults.length > 0 && (
        <div style={{ marginTop: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Live Worker Results</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {combinedResults.map((result, idx) => {
              const colors = getStatusColor(result.status);
              return (
                <div key={idx} style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--input-bg)',
                  borderRadius: '6px',
                  borderLeft: `4px solid ${colors.border}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong>{result.worker_id}</strong>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      backgroundColor: colors.bg,
                      color: colors.text,
                    }}>
                      {result.status}
                    </span>
                  </div>
                  {result.output && (
                    <pre style={{ margin: 0, fontSize: '0.85rem', overflowX: 'auto', color: '#9ca3af' }}>
                      {typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
                    </pre>
                  )}
                  {result.error && (
                    <pre style={{ margin: 0, fontSize: '0.85rem', overflowX: 'auto', color: '#fca5a5' }}>
                      {result.error}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

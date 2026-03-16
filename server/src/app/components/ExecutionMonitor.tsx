'use client';

import React, { useEffect, useState } from 'react';

interface ExecutionMonitorProps {
  status: 'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error';
  errorMessage?: string;
}

export default function ExecutionMonitor({ status, errorMessage }: ExecutionMonitorProps) {
  const [dots, setDots] = useState('');

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

  return (
    <div
      style={{
        marginTop: '1.5rem',
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
  );
}

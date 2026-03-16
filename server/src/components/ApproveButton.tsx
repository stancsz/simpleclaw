'use client';

import React from 'react';

interface ApproveButtonProps {
  onApprove: () => void;
  status: 'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error';
}

export default function ApproveButton({ onApprove, status }: ApproveButtonProps) {
  if (status !== 'waiting_approval') {
    return null;
  }

  return (
    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        onClick={onApprove}
        className="btn-primary bg-green-600 hover:bg-green-700"
        style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
      >
        Approve & Execute Plan
      </button>
    </div>
  );
}

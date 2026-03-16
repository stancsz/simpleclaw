'use client';

import React from 'react';

interface IntentInputProps {
  prompt: string;
  setPrompt: (value: string) => void;
  status: 'idle' | 'planning' | 'waiting_approval' | 'executing' | 'completed' | 'error';
  onSubmit: (e: React.FormEvent) => void;
}

export default function IntentInput({ prompt, setPrompt, status, onSubmit }: IntentInputProps) {
  return (
    <div className="create-bot-section">
      <h2>Natural Language Intent</h2>
      <form onSubmit={onSubmit} className="form-container" style={{ maxWidth: '100%' }}>
        <div className="input-group">
          <label htmlFor="prompt" style={{ color: '#ccc', marginBottom: '0.5rem' }}>
            What would you like the swarm to do?
          </label>
          <textarea
            id="prompt"
            className="input-field bg-neutral-900 text-white border-neutral-700"
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
            className="btn-primary bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50"
            disabled={!prompt.trim() || status === 'planning' || status === 'executing'}
          >
            {status === 'planning' ? 'Planning...' : 'Generate Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}

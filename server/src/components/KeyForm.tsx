'use client';

import React, { useState } from 'react';

interface KeyFormProps {
    onKeyAdded: () => void;
}

export default function KeyForm({ onKeyAdded }: KeyFormProps) {
    const [provider, setProvider] = useState('OpenAI');
    const [apiKey, setApiKey] = useState('');
    const [keyName, setKeyName] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!apiKey.trim()) {
            setError('API Key is required');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key: apiKey, name: keyName || `${provider} Key`, expiresAt: expiresAt || null }),
            });

            if (res.ok) {
                setApiKey('');
                setKeyName('');
                setExpiresAt('');
                onKeyAdded();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to add key');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="create-bot-section" style={{ marginBottom: '2rem' }}>
            <h2>Add New Key</h2>
            <form onSubmit={handleAddKey} className="form-container" style={{ maxWidth: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="input-group">
                        <label style={{ color: '#ccc', marginBottom: '0.5rem', display: 'block' }}>Provider</label>
                        <select
                            className="input-field"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px' }}
                        >
                            <option value="OpenAI">OpenAI</option>
                            <option value="Anthropic">Anthropic</option>
                            <option value="Gemini">Gemini</option>
                            <option value="DeepSeek">DeepSeek</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label style={{ color: '#ccc', marginBottom: '0.5rem', display: 'block' }}>Key Name (optional)</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder={`e.g., My ${provider} Key`}
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="input-group">
                        <label style={{ color: '#ccc', marginBottom: '0.5rem', display: 'block' }}>API Key</label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            style={{ width: '100%', fontFamily: 'monospace' }}
                        />
                    </div>
                    <div className="input-group">
                        <label style={{ color: '#ccc', marginBottom: '0.5rem', display: 'block' }}>Expiry Date (optional)</label>
                        <input
                            type="date"
                            className="input-field"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                            style={{ width: '100%', color: expiresAt ? 'white' : '#888' }}
                        />
                    </div>
                </div>

                {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}

                <button
                    type="submit"
                    className="btn-primary"
                    disabled={isLoading || !apiKey.trim()}
                >
                    {isLoading ? 'Adding...' : 'Add Key'}
                </button>
            </form>
        </div>
    );
}

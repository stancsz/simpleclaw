'use client';

import React, { useState, useEffect } from 'react';
import type { AIKey, AIKeyProvider } from '../../../src/core/types';

export default function KeyManager() {
    const [keys, setKeys] = useState<AIKey[]>([]);
    const [provider, setProvider] = useState<AIKeyProvider | string>('openai');
    const [secret, setSecret] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/keys');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch keys');
            setKeys(data.keys || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const addKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!secret.trim() || !provider) return;

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, secret, name: `${provider}_key` })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add key');

            setSuccess('Key added successfully!');
            setSecret('');
            fetchKeys();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const deleteKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this key?')) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to delete key');

            setSuccess('Key deleted successfully!');
            fetchKeys();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="create-bot-section" style={{ maxWidth: '800px', margin: '0 auto', marginTop: '2rem' }}>
            <h2>Manage AI Keys</h2>
            <p style={{ color: '#888', marginBottom: '1.5rem' }}>
                Securely store your API keys in your Supabase Vault. Keys are encrypted via KMS and never stored in plaintext by the platform.
            </p>

            <form onSubmit={addKey} className="form-container" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ flex: '1' }}>
                        <label htmlFor="provider" style={{ color: '#ccc', marginBottom: '0.5rem' }}>Provider</label>
                        <select
                            id="provider"
                            className="input-field"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            disabled={loading}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="github">GitHub</option>
                            <option value="custom">Custom Endpoint</option>
                        </select>
                    </div>

                    <div className="input-group" style={{ flex: '2' }}>
                        <label htmlFor="secret" style={{ color: '#ccc', marginBottom: '0.5rem' }}>API Key</label>
                        <input
                            id="secret"
                            type="password"
                            className="input-field"
                            placeholder="sk-..."
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || !secret.trim()}
                        style={{ height: '46px' }}
                    >
                        {loading ? 'Adding...' : 'Add Key'}
                    </button>
                </div>
            </form>

            {error && <div className="status-message error">{error}</div>}
            {success && <div className="status-message success" style={{ marginBottom: '1rem' }}>{success}</div>}

            <h3>Your Keys</h3>
            {keys.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666', background: 'var(--bg-color)', borderRadius: '4px', border: '1px dashed var(--border-color)' }}>
                    No keys stored yet. Add one above to get started.
                </div>
            ) : (
                <ul className="bots-list">
                    {keys.map((key) => (
                        <li key={key.id} className="bot-item" style={{ alignItems: 'center' }}>
                            <div>
                                <strong style={{ textTransform: 'capitalize' }}>{key.provider}</strong>
                                <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                                    {key.name}: {key.maskedKey}
                                </div>
                            </div>
                            <button
                                onClick={() => deleteKey(key.id)}
                                className="btn-secondary"
                                disabled={loading}
                                style={{ color: '#ef4444', borderColor: '#ef4444', padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                            >
                                Delete
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

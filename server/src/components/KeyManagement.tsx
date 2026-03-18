'use client';

import React, { useState, useEffect } from 'react';

interface KeyRecord {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
}

export default function KeyManagement() {
    const [keys, setKeys] = useState<KeyRecord[]>([]);
    const [provider, setProvider] = useState('OpenAI');
    const [apiKey, setApiKey] = useState('');
    const [keyName, setKeyName] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/keys');
            if (res.ok) {
                const data = await res.json();
                setKeys(data.keys || []);
            }
        } catch (err) {
            console.error('Failed to fetch keys', err);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

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
                await fetchKeys();
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

    const handleDeleteKey = async (id: string) => {
        try {
            const res = await fetch(`/api/keys?id=${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                await fetchKeys();
            } else {
                console.error('Failed to delete key');
            }
        } catch (err) {
            console.error('Failed to delete key', err);
        }
    };

    return (
        <>
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

            <div className="create-bot-section">
                <h2>Stored Keys (Supabase Vault)</h2>
                {keys.length === 0 ? (
                    <p style={{ color: '#888', fontStyle: 'italic', padding: '1rem 0' }}>No keys stored yet.</p>
                ) : (
                    <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#252525', borderBottom: '1px solid #444' }}>
                                    <th style={{ padding: '1rem', color: '#ccc', fontWeight: 'normal' }}>Name</th>
                                    <th style={{ padding: '1rem', color: '#ccc', fontWeight: 'normal' }}>Provider</th>
                                    <th style={{ padding: '1rem', color: '#ccc', fontWeight: 'normal' }}>Secret</th>
                                    <th style={{ padding: '1rem', color: '#ccc', fontWeight: 'normal' }}>Expires</th>
                                    <th style={{ padding: '1rem', color: '#ccc', fontWeight: 'normal', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map((k) => (
                                    <tr key={k.id} style={{ borderBottom: '1px solid #333' }}>
                                        <td style={{ padding: '1rem', color: '#fff' }}>{k.name}</td>
                                        <td style={{ padding: '1rem', color: '#00E5CC' }}>{k.provider}</td>
                                        <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#aaa' }}>{k.maskedKey}</td>
                                        <td style={{ padding: '1rem', color: '#aaa' }}>{k.expiresAt || 'Never'}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleDeleteKey(k.id)}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    color: '#ef4444',
                                                    border: '1px solid #ef4444',
                                                    borderRadius: '4px',
                                                    padding: '0.25rem 0.75rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

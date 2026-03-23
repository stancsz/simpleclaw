'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface KeyRecord {
    id: string;
    name: string;
    provider: string;
    expiresAt?: string | null;
    maskedKey: string;
    createdAt: string;
}

export default function SettingsPage() {
    const [keys, setKeys] = useState<KeyRecord[]>([]);
    const [provider, setProvider] = useState('OpenAI');
    const [keyName, setKeyName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/secrets');
            if (res.ok) {
                const data = await res.json();
                setKeys(data.secrets || []);
            }
        } catch (err) {
            console.error('Failed to fetch keys', err);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleDeleteKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this key?')) return;
        try {
            const res = await fetch(`/api/secrets?id=${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                fetchKeys();
            } else {
                console.error('Failed to delete key');
            }
        } catch (err) {
            console.error('Failed to delete key', err);
        }
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/secrets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    key: apiKey,
                    name: keyName || `${provider} Key`,
                    expiresAt: expiresAt || null
                }),
            });

            if (res.ok) {
                setProvider('OpenAI');
                setKeyName('');
                setApiKey('');
                setExpiresAt('');
                fetchKeys();
            } else {
                const resData = await res.json();
                setError(resData.error || 'Failed to add key');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '1.5rem', lineHeight: '1' }}>
                        &larr;
                    </Link>
                    <h1>Settings & Key Management</h1>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 1: BYOK UI</div>
            </div>

            <main className="dashboard-main flex flex-col gap-8 w-full">
                <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-white mb-6">Add New Key</h2>
                    <form onSubmit={handleAddKey} className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label htmlFor="provider" className="text-[#888] text-sm font-medium">Provider</label>
                                <select
                                    id="provider"
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value)}
                                    className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors"
                                    required
                                >
                                    <option value="OpenAI">OpenAI</option>
                                    <option value="Anthropic">Anthropic</option>
                                    <option value="Gemini">Gemini</option>
                                    <option value="DeepSeek">DeepSeek</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="keyName" className="text-[#888] text-sm font-medium">Key Name (optional)</label>
                                <input
                                    id="keyName"
                                    type="text"
                                    value={keyName}
                                    onChange={(e) => setKeyName(e.target.value)}
                                    className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                    placeholder="e.g., My AI Key"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label htmlFor="apiKey" className="text-[#888] text-sm font-medium">API Key</label>
                                <input
                                    id="apiKey"
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                    placeholder="sk-..."
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="expiresAt" className="text-[#888] text-sm font-medium">Expiry Date (optional)</label>
                                <input
                                    id="expiresAt"
                                    type="date"
                                    value={expiresAt}
                                    onChange={(e) => setExpiresAt(e.target.value)}
                                    className="w-full p-3 bg-[#2a2a2a] text-[#666] border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors focus:text-white"
                                />
                            </div>
                        </div>

                        {error && <div className="text-red-500 text-sm mt-1">{error}</div>}

                        <button
                            type="submit"
                            className="bg-[#00E5CC] hover:bg-[#00c2ad] text-black font-semibold py-3 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 w-[150px]"
                            disabled={isLoading || !apiKey.trim()}
                        >
                            {isLoading ? 'Adding...' : 'Store Key'}
                        </button>
                    </form>
                </div>

                <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-white mb-6">Configured Keys</h2>

                    {keys.length === 0 ? (
                        <div className="text-[#888] text-center py-8">
                            No keys configured yet. Add one above.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {keys.map((keyRecord) => (
                                <div key={keyRecord.id} className="flex justify-between items-center bg-[#2a2a2a] p-4 rounded-md border border-[#444]">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-white">{keyRecord.name}</span>
                                            <span className="text-xs bg-[#333] text-[#ccc] px-2 py-1 rounded">
                                                {keyRecord.provider}
                                            </span>
                                        </div>
                                        <div className="text-[#888] text-sm mt-1 font-mono">
                                            {keyRecord.maskedKey}
                                        </div>
                                        {keyRecord.expiresAt && (
                                            <div className="text-[#666] text-xs mt-1">
                                                Expires: {new Date(keyRecord.expiresAt).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteKey(keyRecord.id)}
                                        className="text-[#ff4444] hover:text-[#ff6666] transition-colors p-2"
                                        title="Delete key"
                                    >
                                        Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

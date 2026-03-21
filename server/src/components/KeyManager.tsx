'use client';

import React, { useState, useEffect } from 'react';

export interface KeyRecord {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
}

export default function KeyManager() {
    const [keys, setKeys] = useState<KeyRecord[]>([]);

    // Form state
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
                fetchKeys();
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
        if (!confirm('Are you sure you want to delete this key?')) return;
        try {
            const res = await fetch(`/api/keys/${id}`, {
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

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-white mb-6">Add New Key</h2>
                <form onSubmit={handleAddKey} className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Provider</label>
                            <select
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors"
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                            >
                                <option value="OpenAI">OpenAI</option>
                                <option value="Anthropic">Anthropic</option>
                                <option value="Gemini">Gemini</option>
                                <option value="DeepSeek">DeepSeek</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Key Name (optional)</label>
                            <input
                                type="text"
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                placeholder={`e.g., My ${provider} Key`}
                                value={keyName}
                                onChange={(e) => setKeyName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">API Key</label>
                            <textarea
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md font-mono min-h-[100px] resize-y focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                placeholder="sk-..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Expiry Date (optional)</label>
                            <input
                                type="date"
                                className={`w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors ${expiresAt ? 'text-white' : 'text-[#666]'}`}
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-500 text-sm mt-1">{error}</div>}

                    <button
                        type="submit"
                        className="bg-[#00E5CC] hover:bg-[#00c2ad] text-black font-semibold py-3 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 w-[150px]"
                        disabled={isLoading || !apiKey.trim()}
                    >
                        {isLoading ? 'Adding...' : 'Add Key'}
                    </button>
                </form>
            </div>

            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-white mb-6">Stored Keys</h2>
                {keys.length === 0 ? (
                    <p className="text-[#888] italic py-4">No keys stored yet.</p>
                ) : (
                    <div className="rounded-lg overflow-hidden border border-[#333]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#252525] border-b border-[#444] text-[#ccc] font-medium text-sm">
                                    <th className="p-4 font-normal">Name</th>
                                    <th className="p-4 font-normal">Provider</th>
                                    <th className="p-4 font-normal">Secret</th>
                                    <th className="p-4 font-normal">Expires</th>
                                    <th className="p-4 font-normal text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map((k) => (
                                    <tr key={k.id} className="border-b border-[#333] hover:bg-[#222] transition-colors">
                                        <td className="p-4 text-white text-sm">{k.name}</td>
                                        <td className="p-4 text-[#00E5CC] text-sm">{k.provider}</td>
                                        <td className="p-4 font-mono text-[#aaa] text-sm">{k.maskedKey}</td>
                                        <td className="p-4 text-[#aaa] text-sm">{k.expiresAt || 'Never'}</td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => handleDeleteKey(k.id)}
                                                className="text-red-500 hover:bg-red-500/10 border border-red-500/50 hover:border-red-500 rounded px-3 py-1 text-xs transition-colors"
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
        </div>
    );
}

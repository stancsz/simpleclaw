'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import CredentialCard from './CredentialCard';

export interface KeyRecord {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
}

interface KeyFormData {
    provider: string;
    key: string;
    name: string;
    expiresAt: string;
}

export default function KeyManager() {
    const [keys, setKeys] = useState<KeyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors }
    } = useForm<KeyFormData>({
        defaultValues: {
            provider: 'OpenAI',
            key: '',
            name: '',
            expiresAt: ''
        }
    });

    const currentKey = watch('key');

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

    const onSubmit = async (data: KeyFormData) => {
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: data.provider,
                    key: data.key,
                    name: data.name || `${data.provider} Key`,
                    expiresAt: data.expiresAt || null
                }),
            });

            if (res.ok) {
                reset();
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
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Provider</label>
                            <select
                                {...register('provider', { required: 'Provider is required' })}
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors"
                            >
                                <option value="OpenAI">OpenAI</option>
                                <option value="Anthropic">Anthropic</option>
                                <option value="Gemini">Gemini</option>
                                <option value="DeepSeek">DeepSeek</option>
                                <option value="Other">Other</option>
                            </select>
                            {errors.provider && <span className="text-red-500 text-xs">{errors.provider.message}</span>}
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Key Name (optional)</label>
                            <input
                                type="text"
                                {...register('name')}
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                placeholder="e.g., My AI Key"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">API Key</label>
                            <textarea
                                {...register('key', { required: 'API Key is required' })}
                                className="w-full p-3 bg-[#2a2a2a] text-white border border-[#444] rounded-md font-mono min-h-[100px] resize-y focus:outline-none focus:border-[#00E5CC] transition-colors placeholder-[#666]"
                                placeholder="sk-..."
                            />
                            {errors.key && <span className="text-red-500 text-xs">{errors.key.message}</span>}
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[#888] text-sm font-medium">Expiry Date (optional)</label>
                            <input
                                type="date"
                                {...register('expiresAt')}
                                className="w-full p-3 bg-[#2a2a2a] text-[#666] border border-[#444] rounded-md focus:outline-none focus:border-[#00E5CC] transition-colors focus:text-white"
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-500 text-sm mt-1">{error}</div>}

                    <button
                        type="submit"
                        className="bg-[#00E5CC] hover:bg-[#00c2ad] text-black font-semibold py-3 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 w-[150px]"
                        disabled={isLoading || !currentKey?.trim()}
                    >
                        {isLoading ? 'Adding...' : 'Encrypt & Store'}
                    </button>
                </form>
            </div>

            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-white mb-6">Stored Keys</h2>
                {keys.length === 0 ? (
                    <p className="text-[#888] italic py-4">No keys stored yet.</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {keys.map((k) => (
                            <CredentialCard
                                key={k.id}
                                id={k.id}
                                name={k.name}
                                provider={k.provider}
                                maskedKey={k.maskedKey}
                                createdAt={k.createdAt}
                                expiresAt={k.expiresAt}
                                onDelete={handleDeleteKey}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

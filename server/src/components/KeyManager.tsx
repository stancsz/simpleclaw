'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';

// === Add Key Form Component Logic ===

interface KeyFormData {
    provider: string;
    key: string;
    name: string;
    expiresAt: string;
}

interface AddKeyFormProps {
    onKeyAdded: () => void;
}

function AddKeyForm({ onKeyAdded }: AddKeyFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const {
        register,
        handleSubmit,
        reset,
        watch,
        getValues,
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
                onKeyAdded();
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
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-white mb-6">Add New Key</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="provider" className="text-[#888] text-sm font-medium">Provider</label>
                        <select
                            id="provider"
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
                        <label htmlFor="key" className="text-[#888] text-sm font-medium">API Key</label>
                        <textarea
                            id="key"
                            {...register('key', {
                                required: 'API Key is required',
                                validate: (value) => {
                                    const provider = getValues('provider');
                                    if (provider === 'OpenAI' && !value.startsWith('sk-')) {
                                        return 'OpenAI keys must start with sk-';
                                    }
                                    if (provider === 'Anthropic' && !value.startsWith('sk-ant-')) {
                                        return 'Anthropic keys must start with sk-ant-';
                                    }
                                    if (provider === 'DeepSeek' && !value.startsWith('sk-')) {
                                        return 'DeepSeek keys must start with sk-';
                                    }
                                    return true;
                                }
                            })}
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
    );
}

// === Credential Card Component Logic ===

interface EditFormData {
    name: string;
    key: string;
    expiresAt: string;
}

interface CredentialCardProps {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
    onDelete: (id: string) => void;
    onUpdate: (id: string, name: string, key?: string, expiresAt?: string | null) => Promise<void>;
}

function CredentialCard({
    id,
    name,
    provider,
    maskedKey,
    createdAt,
    expiresAt,
    onDelete,
    onUpdate
}: CredentialCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState('');

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors }
    } = useForm<EditFormData>({
        defaultValues: {
            name: name,
            key: '', // Leave blank so we only update if they type a new one
            expiresAt: expiresAt ? new Date(expiresAt).toISOString().split('T')[0] : ''
        }
    });

    const onSubmit = async (data: EditFormData) => {
        setError('');
        setIsUpdating(true);
        try {
            await onUpdate(id, data.name, data.key || undefined, data.expiresAt || null);
            setIsEditing(false);
            reset({
                name: data.name,
                key: '',
                expiresAt: data.expiresAt
            });
        } catch (err: any) {
            setError(err.message || 'Failed to update key');
        } finally {
            setIsUpdating(false);
        }
    };

    if (isEditing) {
        return (
            <div className="bg-[#252525] border border-[#00E5CC] rounded-lg p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium text-lg">Edit {provider} Key</span>
                    <button onClick={() => { setIsEditing(false); setError(''); }} className="text-[#888] hover:text-white text-sm transition-colors">
                        Cancel
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[#888] text-xs">Name</label>
                        <input
                            type="text"
                            {...register('name', { required: 'Name is required' })}
                            className="w-full p-2 bg-[#1a1a1a] text-white border border-[#444] rounded text-sm focus:border-[#00E5CC] focus:outline-none"
                        />
                        {errors.name && <span className="text-red-500 text-xs">{errors.name.message}</span>}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[#888] text-xs">New API Key (leave blank to keep current key)</label>
                        <input
                            type="text"
                            {...register('key')}
                            placeholder={maskedKey}
                            className="w-full p-2 bg-[#1a1a1a] text-white border border-[#444] rounded text-sm focus:border-[#00E5CC] focus:outline-none font-mono"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[#888] text-xs">Expiry Date</label>
                        <input
                            type="date"
                            {...register('expiresAt')}
                            className="w-full p-2 bg-[#1a1a1a] text-white border border-[#444] rounded text-sm focus:border-[#00E5CC] focus:outline-none"
                        />
                    </div>

                    {error && <span className="text-red-500 text-xs">{error}</span>}

                    <div className="flex justify-end gap-3 mt-2">
                        <button
                            type="submit"
                            disabled={isUpdating}
                            className="bg-[#00E5CC] hover:bg-[#00c2ad] text-black text-sm font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50"
                        >
                            {isUpdating ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="bg-[#252525] border border-[#333] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:border-[#444]">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-lg">{name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#00E5CC]/30 text-[#00E5CC]">
                        {provider}
                    </span>
                </div>
                <div className="text-[#888] font-mono text-sm mt-1">
                    {maskedKey}
                </div>
                <div className="text-[#666] text-xs mt-2 flex gap-4">
                    <span>Created: {new Date(createdAt).toLocaleDateString()}</span>
                    {expiresAt && (
                        <span className={new Date(expiresAt) < new Date() ? "text-red-400" : ""}>
                            Expires: {new Date(expiresAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center">
                <button
                    onClick={() => setIsEditing(true)}
                    className="text-[#00E5CC] hover:text-white hover:bg-[#00E5CC]/10 border border-[#00E5CC]/30 hover:border-[#00E5CC] rounded px-4 py-2 text-sm transition-colors focus:outline-none"
                    aria-label={`Edit ${name} credential`}
                >
                    Edit
                </button>
                <button
                    onClick={() => onDelete(id)}
                    className="text-red-500 hover:text-white hover:bg-red-500/80 border border-red-500/50 hover:border-red-500 rounded px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    aria-label={`Delete ${name} credential`}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

// === Key List Component Logic ===

export interface KeyRecord {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
}

interface KeyListProps {
    keys: KeyRecord[];
    onDeleteKey: (id: string) => void;
    onUpdateKey: (id: string, name: string, key?: string, expiresAt?: string | null) => Promise<void>;
}

function KeyList({ keys, onDeleteKey, onUpdateKey }: KeyListProps) {
    return (
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
                            onDelete={onDeleteKey}
                            onUpdate={onUpdateKey}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// === Main KeyManager Component ===

export default function KeyManager() {
    const [keys, setKeys] = useState<KeyRecord[]>([]);

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

    const handleUpdateKey = async (id: string, name: string, key?: string, expiresAt?: string | null) => {
        const payload: any = { name, expiresAt };
        if (key) {
            payload.key = key;
        }

        const res = await fetch(`/api/keys/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to update key');
        }

        fetchKeys();
    };

    return (
        <div className="flex flex-col gap-8 w-full">
            <AddKeyForm onKeyAdded={fetchKeys} />
            <KeyList keys={keys} onDeleteKey={handleDeleteKey} onUpdateKey={handleUpdateKey} />
        </div>
    );
}

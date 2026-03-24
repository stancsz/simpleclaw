import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

export interface CredentialCardProps {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
    onDelete: (id: string) => void;
    onUpdate: (id: string, name: string, key?: string, expiresAt?: string | null) => Promise<void>;
}

interface EditFormData {
    name: string;
    key: string;
    expiresAt: string;
}

export default function CredentialCard({
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

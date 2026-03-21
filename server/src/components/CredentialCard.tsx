import React from 'react';

export interface CredentialCardProps {
    id: string;
    name: string;
    provider: string;
    maskedKey: string;
    createdAt: string;
    expiresAt?: string;
    onDelete: (id: string) => void;
}

export default function CredentialCard({
    id,
    name,
    provider,
    maskedKey,
    createdAt,
    expiresAt,
    onDelete
}: CredentialCardProps) {
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

            <div className="flex items-center self-end md:self-center">
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

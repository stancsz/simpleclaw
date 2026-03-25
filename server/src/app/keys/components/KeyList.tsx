'use client';

import React from 'react';
import CredentialCard from './CredentialCard';

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

export default function KeyList({ keys, onDeleteKey, onUpdateKey }: KeyListProps) {
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

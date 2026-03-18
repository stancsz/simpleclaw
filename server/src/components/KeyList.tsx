'use client';

import React from 'react';

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
    onKeyDeleted: () => void;
}

export default function KeyList({ keys, onKeyDeleted }: KeyListProps) {
    const handleDeleteKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this key?')) return;
        try {
            const res = await fetch(`/api/keys?id=${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                onKeyDeleted();
            } else {
                console.error('Failed to delete key');
            }
        } catch (err) {
            console.error('Failed to delete key', err);
        }
    };

    return (
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
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import KeyManagementForm from '../../../components/KeyManagementForm';
import KeyList, { KeyRecord } from '../../../components/KeyList';

export default function KeysSettingsPage() {
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
        <div className="dashboard-container">
            <div className="dashboard-header" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '1.5rem', lineHeight: '1' }}>
                        &larr;
                    </Link>
                    <h1>Settings</h1>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 1: BYOK UI</div>
            </div>

            <main className="dashboard-main">
                <KeyManagementForm onKeyAdded={fetchKeys} />
                <KeyList keys={keys} onDeleteKey={handleDeleteKey} />
            </main>
        </div>
    );
}

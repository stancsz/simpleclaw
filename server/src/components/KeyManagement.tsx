'use client';

import React, { useState, useEffect } from 'react';
import AddKeyForm from './AddKeyForm';
import KeyList, { KeyRecord } from './KeyList';

export default function KeyManagement() {
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

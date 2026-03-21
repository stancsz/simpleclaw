'use client';

import React from 'react';
import Link from 'next/link';
import KeyManagement from '@/components/KeyManagement';

export default function SettingsPage() {
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
                <KeyManagement />
            </main>
        </div>
    );
}

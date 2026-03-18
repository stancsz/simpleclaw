import React from 'react';
import Link from 'next/link';
import KeyManagement from '../../components/KeyManagement';

export default function KeysPage() {
    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Manage API Keys</h1>
                <Link href="/" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
                    &larr; Back to Dashboard
                </Link>
            </div>

            <main className="dashboard-main">
                <KeyManagement />
            </main>
        </div>
    );
}

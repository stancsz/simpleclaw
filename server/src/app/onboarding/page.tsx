'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function OnboardingPage() {
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [serviceRoleKey, setServiceRoleKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!supabaseUrl.trim() || !serviceRoleKey.trim()) {
            setStatus('error');
            setMessage('Both fields are required.');
            return;
        }

        try {
            new URL(supabaseUrl);
        } catch (_) {
            setStatus('error');
            setMessage('Please enter a valid URL.');
            return;
        }

        setStatus('submitting');
        setMessage('');

        try {
            const response = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supabaseUrl, serviceRoleKey }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save credentials.');
            }

            setStatus('success');
            setMessage('Credentials saved securely!');
            setSupabaseUrl('');
            setServiceRoleKey('');
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(err.message || 'An unexpected error occurred.');
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '1.5rem', lineHeight: '1' }}>
                        &larr;
                    </Link>
                    <h1>Platform Onboarding</h1>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 1: BYOK UI</div>
            </div>

            <main className="dashboard-main">
                <div className="create-bot-section">
                    <h2>Supabase Configuration</h2>
                    <p style={{ color: '#ccc', marginBottom: '1rem' }}>
                        Enter your Supabase project URL and service_role key. Your key will be KMS encrypted and stored locally.
                    </p>

                    {status === 'success' && (
                        <div style={{ padding: '1rem', backgroundColor: '#0f3a35', border: '1px solid #00E5CC', borderRadius: '4px', marginBottom: '1rem', color: '#00E5CC' }}>
                            {message}
                        </div>
                    )}

                    {status === 'error' && (
                        <div style={{ padding: '1rem', backgroundColor: '#3a0f14', border: '1px solid #ff4444', borderRadius: '4px', marginBottom: '1rem', color: '#ff4444' }}>
                            {message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="form-container" style={{ maxWidth: '100%' }}>
                        <div className="input-group">
                            <label htmlFor="supabaseUrl" style={{ color: '#ccc', marginBottom: '0.5rem' }}>
                                Supabase URL
                            </label>
                            <input
                                id="supabaseUrl"
                                type="text"
                                className="input-field"
                                placeholder="https://your-project.supabase.co"
                                value={supabaseUrl}
                                onChange={(e) => setSupabaseUrl(e.target.value)}
                                disabled={status === 'submitting'}
                            />
                        </div>

                        <div className="input-group" style={{ marginTop: '1rem' }}>
                            <label htmlFor="serviceRoleKey" style={{ color: '#ccc', marginBottom: '0.5rem' }}>
                                Service Role Key
                            </label>
                            <input
                                id="serviceRoleKey"
                                type="password"
                                className="input-field"
                                placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                                value={serviceRoleKey}
                                onChange={(e) => setServiceRoleKey(e.target.value)}
                                disabled={status === 'submitting'}
                            />
                        </div>

                        <div className="button-group" style={{ marginTop: '1.5rem' }}>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={status === 'submitting' || !supabaseUrl.trim() || !serviceRoleKey.trim()}
                            >
                                {status === 'submitting' ? 'Saving...' : 'Save Credentials'}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}

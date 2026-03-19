import { NextResponse } from 'next/server';
import { onboardUserKey } from '../../../../../src/security/onboarding';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { supabaseUrl, serviceRoleKey } = body;

        if (!supabaseUrl || !serviceRoleKey) {
            return NextResponse.json({ error: 'supabaseUrl and serviceRoleKey are required' }, { status: 400 });
        }

        // Use 'test-user' as the minimal auth for Phase 0
        const userId = 'test-user';

        await onboardUserKey(userId, supabaseUrl, serviceRoleKey);

        return NextResponse.json({ success: true, message: 'Credentials saved securely' }, { status: 200 });
    } catch (error: any) {
        console.error('Error onboarding user key:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

import React from 'react';
import { render, screen } from '@testing-library/react';
import { test, expect, mock } from 'bun:test';
import KeysPage from './page';

// Mock the child components so we just test the layout/rendering
mock.module('@/components/KeyManagement', () => {
    return {
        default: () => <div data-testid="mock-key-management">Mock Key Management</div>
    };
});

test('KeysPage renders the Key Management title and components', () => {
    render(<KeysPage />);

    // Verify the title is present
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Key Management');

    // Verify the mock key management component renders
    const keyManagement = screen.getByTestId('mock-key-management');
    expect(keyManagement).toBeTruthy();
});

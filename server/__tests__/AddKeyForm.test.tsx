import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import AddKeyForm from '../src/components/AddKeyForm';

// Helper to grab elements
const setup = () => {
    const onKeyAdded = mock();
    const { container, getByRole } = render(<AddKeyForm onKeyAdded={onKeyAdded} />);

    return {
        onKeyAdded,
        providerSelect: container.querySelector('select[name="provider"]') as HTMLSelectElement,
        keyInput: container.querySelector('textarea[name="key"]') as HTMLTextAreaElement,
        submitButton: container.querySelector('button[type="submit"]') as HTMLButtonElement,
    };
};

describe('AddKeyForm Component', () => {
    beforeEach(() => {
        global.fetch = mock(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: '123', success: true }),
            }) as any
        );
    });

    it('validates OpenAI key format', async () => {
        const { providerSelect, keyInput, submitButton } = setup();

        fireEvent.change(providerSelect, { target: { value: 'OpenAI' } });
        fireEvent.change(keyInput, { target: { value: 'invalid-key' } });

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('OpenAI keys must start with sk-')).toBeTruthy();
        });
    });

    it('validates Anthropic key format', async () => {
        const { providerSelect, keyInput, submitButton } = setup();

        fireEvent.change(providerSelect, { target: { value: 'Anthropic' } });
        fireEvent.change(keyInput, { target: { value: 'invalid-key' } });

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Anthropic keys must start with sk-ant-')).toBeTruthy();
        });
    });

    it('submits successfully with valid key', async () => {
        const { onKeyAdded, providerSelect, keyInput, submitButton } = setup();

        fireEvent.change(providerSelect, { target: { value: 'OpenAI' } });
        fireEvent.change(keyInput, { target: { value: 'sk-valid-key' } });

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
            expect(onKeyAdded).toHaveBeenCalled();
        });
    });
});

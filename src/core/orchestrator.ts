import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';
import { SwarmManifest, Task, PlanDiffApprove } from './types';

// Export the handler for testing
export const orchestratorHandler = (req: ff.Request, res: ff.Response) => {
    // Basic CORS handling
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    const body = req.body;
    const prompt = body?.prompt;
    const user_id = body?.user_id;

    if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "prompt" field in request body.' });
        return;
    }

    if (!user_id || typeof user_id !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "user_id" field in request body.' });
        return;
    }

    try {
        // Parse the intent into a swarm manifest (mocked for Phase 0)
        const manifest = mockParseIntentToManifest(prompt);

        // Compute read/write operations for Plan-Diff-Approve
        const write_operations = manifest.steps.filter(s => s.action_type === 'WRITE').length;
        const read_operations = manifest.steps.filter(s => s.action_type === 'READ').length;

        const pda: PlanDiffApprove = {
            plan: manifest,
            write_operations,
            read_operations,
            status: 'waiting_approval'
        };

        // Return both the structured JSON and the YAML format
        res.status(200).json({
            status: 'success',
            pda,
            yaml: yaml.stringify(manifest)
        });
    } catch (error) {
        console.error('Error generating manifest:', error);
        res.status(500).json({ error: 'Internal server error while generating manifest.' });
    }
};

// Orchestrator HTTP endpoint
ff.http('orchestrator', orchestratorHandler);

/**
 * Mock function to simulate an LLM parsing the natural language intent into a DAG.
 * In the future, this will call out to an LLM provider using the user's BYOK key.
 */
function mockParseIntentToManifest(intent: string): SwarmManifest {
    const lowerIntent = intent.toLowerCase();
    const skills_required: string[] = [];
    const credentials_required: string[] = [];
    const steps: Task[] = [];
    let stepCount = 1;

    // Simple keyword mapping for Phase 0
    if (lowerIntent.includes('shopify')) {
        skills_required.push('shopify-order-sync');
        credentials_required.push('shopify_api_key');

        // Add a 3-step DAG for typical prompts: 1. Fetch orders (READ), 2. Check Inventory (READ), 3. Post (WRITE)
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Fetch Shopify orders',
            worker: `worker_a`,
            skills: ['shopify-order-sync'],
            credentials: ['shopify_api_key'],
            depends_on: [],
            action_type: 'READ'
        });

        skills_required.push('google-sheets-inventory');
        credentials_required.push('google_oauth_token');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Cross-reference Google Sheets',
            worker: `worker_b`,
            skills: ['google-sheets-inventory'],
            credentials: ['google_oauth_token'],
            depends_on: [], // Can run in parallel with Shopify fetch
            action_type: 'READ'
        });

        if (lowerIntent.includes('slack')) {
            skills_required.push('slack-digest-poster');
            credentials_required.push('slack_bot_token');
            steps.push({
                id: `step_${stepCount++}`,
                description: 'Post Slack digest',
                worker: `worker_c`,
                skills: ['slack-digest-poster'],
                credentials: ['slack_bot_token'],
                depends_on: ['step_1', 'step_2'], // Depends on both READ steps
                action_type: 'WRITE'
            });
        }
    } else if (lowerIntent.includes('email') || lowerIntent.includes('gmail')) {
        skills_required.push('gmail-drafter');
        credentials_required.push('google_oauth_token');

        // 3-step DAG
        skills_required.push('data-gatherer');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Gather context data',
            worker: `worker_a`,
            skills: ['data-gatherer'],
            credentials: [],
            depends_on: [],
            action_type: 'READ'
        });

        skills_required.push('data-analyzer');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Analyze data',
            worker: `worker_b`,
            skills: ['data-analyzer'],
            credentials: [],
            depends_on: ['step_1'],
            action_type: 'READ'
        });

        steps.push({
            id: `step_${stepCount++}`,
            description: 'Draft email summary',
            worker: `worker_c`,
            skills: ['gmail-drafter'],
            credentials: ['google_oauth_token'],
            depends_on: ['step_2'],
            action_type: 'WRITE'
        });
    } else {
        // Default to a generic 3-step DAG
        skills_required.push('generic-web-search');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Search for information',
            worker: `worker_a`,
            skills: ['generic-web-search'],
            credentials: [],
            depends_on: [],
            action_type: 'READ'
        });

        skills_required.push('data-analyzer');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Process results',
            worker: `worker_b`,
            skills: ['data-analyzer'],
            credentials: [],
            depends_on: ['step_1'],
            action_type: 'READ'
        });

        skills_required.push('generic-writer');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Write final report',
            worker: `worker_c`,
            skills: ['generic-writer'],
            credentials: [],
            depends_on: ['step_2'],
            action_type: 'WRITE'
        });
    }

    return {
        version: "1.0",
        intent_parsed: intent,
        skills_required,
        credentials_required,
        schedule: lowerIntent.includes('every night') ? "0 2 * * *" : undefined,
        steps
    };
}

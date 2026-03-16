import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';
import { SwarmManifest, SwarmStep } from './schema';

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

        // Return both the structured JSON and the YAML format
        res.status(200).json({
            status: 'success',
            plan: manifest,
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
    const steps: SwarmStep[] = [];
    let stepCount = 1;

    // Simple keyword mapping for Phase 0
    if (lowerIntent.includes('shopify')) {
        skills_required.push('shopify-order-sync');
        credentials_required.push('shopify_api_key');
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Fetch Shopify orders',
            worker: `worker_${String.fromCharCode(96 + stepCount - 1)}`,
            skills: ['shopify-order-sync'],
            credentials: ['shopify_api_key'],
            depends_on: [],
            action_type: 'READ'
        });
    }

    if (lowerIntent.includes('slack')) {
        skills_required.push('slack-digest-poster');
        credentials_required.push('slack_bot_token');
        const depends_on = stepCount > 1 ? [`step_${stepCount - 1}`] : [];
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Post Slack digest',
            worker: `worker_${String.fromCharCode(96 + stepCount - 1)}`,
            skills: ['slack-digest-poster'],
            credentials: ['slack_bot_token'],
            depends_on: depends_on,
            action_type: 'WRITE'
        });
    }

    if (lowerIntent.includes('email') || lowerIntent.includes('gmail')) {
        skills_required.push('gmail-drafter');
        credentials_required.push('google_oauth_token');
        const depends_on = stepCount > 1 ? [`step_${stepCount - 1}`] : [];
        steps.push({
            id: `step_${stepCount++}`,
            description: 'Draft email summary',
            worker: `worker_${String.fromCharCode(96 + stepCount - 1)}`,
            skills: ['gmail-drafter'],
            credentials: ['google_oauth_token'],
            depends_on: depends_on,
            action_type: 'WRITE'
        });
    }

    // Default to a generic step if no keywords matched
    if (steps.length === 0) {
        skills_required.push('generic-web-search');
        steps.push({
            id: 'step_1',
            description: 'Process intent',
            worker: 'worker_a',
            skills: ['generic-web-search'],
            credentials: [],
            depends_on: [],
            action_type: 'READ'
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

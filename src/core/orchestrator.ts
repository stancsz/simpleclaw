import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';

// Interface defining the swarm manifest based on SWARM_SPEC.md
export interface SwarmManifest {
    version: string;
    intent: string;
    skills_required: string[];
    credentials_required: string[];
    schedule?: string;
    dag: SwarmStep[];
}

export interface SwarmStep {
    id: string;
    description: string;
    worker: string;
    skills: string[];
    credentials: string[];
    depends_on: string[];
    action_type: 'READ' | 'WRITE';
}

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
    const intent = body?.intent;

    if (!intent || typeof intent !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "intent" field in request body.' });
        return;
    }

    try {
        // Parse the intent into a swarm manifest (mocked for Phase 0)
        const manifest = mockParseIntentToManifest(intent);

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
    // For now, regardless of the input, we return a mock plan for demonstration
    // It mocks parsing the intent: "pull all unfulfilled Shopify orders... and send me a Slack summary"
    return {
        version: "1.0",
        intent: intent,
        skills_required: ["shopify-order-sync", "slack-digest-poster"],
        credentials_required: ["shopify_api_key", "slack_bot_token"],
        schedule: "0 2 * * *",
        dag: [
            {
                id: "step_1",
                description: "Fetch unfulfilled Shopify orders",
                worker: "worker_a",
                skills: ["shopify-order-sync"],
                credentials: ["shopify_api_key"],
                depends_on: [],
                action_type: "READ"
            },
            {
                id: "step_2",
                description: "Post Slack digest",
                worker: "worker_b",
                skills: ["slack-digest-poster"],
                credentials: ["slack_bot_token"],
                depends_on: ["step_1"],
                action_type: "WRITE"
            }
        ]
    };
}

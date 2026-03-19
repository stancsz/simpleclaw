import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';
import { SwarmManifest, Task, PlanDiffApprove } from './types';
import { parseIntentToManifest } from './llm';
import { DBClient } from '../db/client';
import { executeSwarmManifest } from './dispatcher';

export async function executePlan(manifest: SwarmManifest, sessionId: string, db: DBClient): Promise<any> {
    try {
        const results = await executeSwarmManifest(manifest, sessionId, db);
        db.updateSessionStatus(sessionId, 'completed');
        return results;
    } catch (error: any) {
        console.error('Error executing swarm manifest in executePlan:', error);
        db.updateSessionStatus(sessionId, 'error');
        db.writeAuditLog(sessionId, 'swarm_execution_failed', { error: error.message || String(error) });
        throw error;
    }
}

export function validateManifest(manifest: SwarmManifest, availableSkills: string[]): boolean {
    const stepIds = new Set(manifest.steps.map(s => s.id));

    // Check skills
    for (const skill of manifest.skills_required) {
        if (!availableSkills.includes(skill)) {
            console.error(`Skill ${skill} is not in available skills`);
            return false;
        }
    }

    // Check DAG cycles and dependencies
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (nodeId: string): boolean => {
        if (recStack.has(nodeId)) return true; // Cycle detected
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recStack.add(nodeId);

        const node = manifest.steps.find(s => s.id === nodeId);
        if (node) {
            for (const dep of node.depends_on) {
                if (!stepIds.has(dep)) {
                    console.error(`Dependency ${dep} does not exist in steps`);
                    return true; // We use true here to abort the check loop early and fail validation
                }
                if (checkCycle(dep)) return true;
            }
        }

        recStack.delete(nodeId);
        return false;
    };

    for (const step of manifest.steps) {
        if (checkCycle(step.id)) {
            console.error(`Cycle detected or missing dependency involving step ${step.id}`);
            return false;
        }
    }

    return true;
}

// Export the handler for testing
export const orchestratorHandler = async (req: ff.Request, res: ff.Response) => {
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
    const session_id = body?.session_id;
    const action = body?.action;

    if (!user_id || typeof user_id !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "user_id" field in request body.' });
        return;
    }

    const dbClient = new DBClient(process.env.DATABASE_URL || 'sqlite://local.db');

    if (session_id && (action === 'approve' || action === 'execute')) {
        try {
            const manifest = body?.manifest;
            if (!manifest) {
                res.status(400).json({ error: 'Missing manifest for approval/execution.' });
                return;
            }

            dbClient.updateSessionStatus(session_id, 'approved');

            // Execute the plan asynchronously so the UI can poll for results
            executePlan(manifest, session_id, dbClient).catch(() => {});

            res.status(200).json({ status: 'dispatched', message: 'Session approved and execution started.', executionId: session_id, workers: manifest.steps.map((s: any) => s.worker) });
            return;
        } catch (error: any) {
            console.error('Error dispatching execution:', error);
            res.status(500).json({ error: error.message || 'Internal server error while starting execution.' });
            return;
        }
    }

    // Default to 'plan' action if prompt is provided
    if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "prompt" field in request body.' });
        return;
    }

    // Example available skills - in real life this comes from DB / standard library
    const availableSkills = [
        'github',
        'github-fetch-issues',
        'shopify-order-sync',
        'google-sheets-inventory',
        'slack-digest-poster',
        'gmail-drafter',
        'data-gatherer',
        'data-analyzer',
        'generic-web-search',
        'generic-writer',
        'mock-skill'
    ];

    try {
        // Parse the intent into a swarm manifest using LLM
        const manifest = await parseIntentToManifest(prompt, availableSkills);

        // Validate the manifest
        if (!validateManifest(manifest, availableSkills)) {
            res.status(400).json({ error: 'Generated manifest failed validation.' });
            return;
        }

        // Compute read/write operations for Plan-Diff-Approve
        const write_operations = manifest.steps.filter(s => s.action_type === 'WRITE').length;
        const read_operations = manifest.steps.filter(s => s.action_type === 'READ').length;

        const context = { prompt, availableSkills };
        const newSessionId = dbClient.createSession(user_id, context, manifest);

        const pda: PlanDiffApprove = {
            plan: manifest,
            write_operations,
            read_operations,
            status: 'waiting_approval',
            sessionId: newSessionId
        };

        // Return both the structured JSON and the YAML format
        res.status(200).json({
            status: 'success',
            session_id: newSessionId,
            pda,
            yaml: yaml.stringify(manifest)
        });
    } catch (error: any) {
        console.error('Error generating manifest:', error);
        res.status(500).json({ error: error.message || 'Internal server error while generating manifest.' });
    }
};

// Orchestrator HTTP endpoint
ff.http('orchestrator', orchestratorHandler);

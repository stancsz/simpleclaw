
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';
import { SwarmManifest, Task, PlanDiffApprove } from './types';


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

    if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "prompt" field in request body.' });
        return;
    }

    if (!user_id || typeof user_id !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "user_id" field in request body.' });
        return;
    }

    // Example available skills - in real life this comes from DB / standard library
    const availableSkills = [
        'shopify-order-sync',
        'google-sheets-inventory',
        'slack-digest-poster',
        'gmail-drafter',
        'data-gatherer',
        'data-analyzer',
        'generic-web-search',
        'generic-writer'
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
    } catch (error: any) {
        console.error('Error generating manifest:', error);
        res.status(500).json({ error: error.message || 'Internal server error while generating manifest.' });
    }
};

// Orchestrator HTTP endpoint
ff.http('orchestrator', orchestratorHandler);

export const TaskSchema = z.object({
    id: z.string().describe("Unique identifier for the step (e.g., 'step_1')"),
    description: z.string().describe("Short description of the task"),
    worker: z.string().describe("Identifier for the worker executing the task (e.g., 'worker_a')"),
    skills: z.array(z.string()).describe("List of skill names required for this task"),
    credentials: z.array(z.string()).describe("List of credential names required for this task"),
    depends_on: z.array(z.string()).describe("List of task ids that this task depends on"),
    action_type: z.enum(["READ", "WRITE"]).describe("Type of action: READ for non-mutating, WRITE for mutating operations")
});

export const SwarmManifestSchema = z.object({
    version: z.string().describe("Manifest schema version (use '1.0')"),
    intent_parsed: z.string().describe("The user intent parsed and normalized"),
    skills_required: z.array(z.string()).describe("Unique list of all skills required across all tasks"),
    credentials_required: z.array(z.string()).describe("Unique list of all credentials required across all tasks"),
    schedule: z.string().nullable().optional().describe("Cron schedule string if intent describes recurring action, omitted otherwise"),
    steps: z.array(TaskSchema).describe("DAG of execution steps")
});

export async function parseIntentToManifest(intent: string, availableSkills: string[]): Promise<SwarmManifest> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;

    if (!openaiApiKey && !deepseekApiKey) {
        throw new Error("Missing API key. Provide either OPENAI_API_KEY or DEEPSEEK_API_KEY.");
    }

    let client: OpenAI;
    let model: string;
    let isDeepseek = false;

    if (deepseekApiKey) {
        client = new OpenAI({
            apiKey: deepseekApiKey,
            baseURL: "https://api.deepseek.com"
        });
        model = "deepseek-chat";
        isDeepseek = true;
    } else {
        client = new OpenAI({
            apiKey: openaiApiKey!
        });
        model = "gpt-4o";
    }

    const systemPrompt = `You are a swarm orchestrator. Your job is to parse a natural language intent and convert it into a valid SwarmManifest DAG execution plan.
You must use the following available skills: ${availableSkills.join(', ')}. If a task requires a skill not in the list, try to substitute with a generic equivalent or reject it by describing a generic skill.
Ensure dependencies form a valid Directed Acyclic Graph.
Determine if any credentials will be needed (e.g. shopify_api_key, slack_bot_token, google_oauth_token).`;

    let completion;

    if (isDeepseek) {
        // Deepseek might not fully support beta.chat.completions.parse, so let's fallback to regular JSON mode
        const res = await client.chat.completions.create({
            model: model,
            messages: [
                { role: "system", content: systemPrompt + "\nRespond in JSON format matching the SwarmManifest schema exactly." },
                { role: "user", content: intent },
            ],
            response_format: { type: "json_object" },
        });

        const rawJson = res.choices[0].message.content;
        if (!rawJson) throw new Error("Failed to parse intent into manifest.");
        return JSON.parse(rawJson) as SwarmManifest;
    } else {
        completion = await client.chat.completions.parse({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: intent },
            ],
            response_format: zodResponseFormat(SwarmManifestSchema, "swarm_manifest"),
        });

        if (!completion.choices[0].message.parsed) {
            throw new Error("Failed to parse intent into manifest.");
        }

        return completion.choices[0].message.parsed as SwarmManifest;
    }
}

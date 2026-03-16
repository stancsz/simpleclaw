import { expect, test, describe, beforeAll, afterAll, mock } from "bun:test";
import * as ff from '@google-cloud/functions-framework';
import { validateManifest, orchestratorHandler } from './orchestrator';
import { SwarmManifest } from "./types";
import * as llm from './llm';

// Import to register the function
import './orchestrator';

describe("Orchestrator Cloud Function (Real LLM)", () => {
    let originalOpenAIKey: string | undefined;
    let originalDeepseekKey: string | undefined;

    beforeAll(() => {
        originalOpenAIKey = process.env.OPENAI_API_KEY;
        originalDeepseekKey = process.env.DEEPSEEK_API_KEY;
    });

    afterAll(() => {
        if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
        else delete process.env.OPENAI_API_KEY;

        if (originalDeepseekKey) process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
        else delete process.env.DEEPSEEK_API_KEY;
    });

    test("handles valid POST request with generic intent", async () => {
        // Skip if no API key is available
        if (!process.env.OPENAI_API_KEY && !process.env.DEEPSEEK_API_KEY) {
            console.log("Skipping real LLM test due to missing API keys.");
            return;
        }

        const req = {
            method: 'POST',
            body: {
                prompt: "Summarize status and send an email",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody.status).toBe('success');
        expect(responseBody.pda.plan.steps.length).toBeGreaterThan(0);
        expect(responseBody.pda.plan.skills_required.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for LLM call

    test("handles missing API key gracefully", async () => {
        // Temporarily clear API keys
        delete process.env.OPENAI_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;

        const req = {
            method: 'POST',
            body: {
                prompt: "Do something",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(500);
        expect(responseBody.error).toContain("Missing API key");

        // Restore keys
        if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
        if (originalDeepseekKey) process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
    });

    test("rejects non-POST methods", async () => {
        const req = {
            method: 'GET',
            body: {}
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(405);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing prompt", async () => {
        const req = {
            method: 'POST',
            body: {
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing user_id", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "Do something else"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("handles OPTIONS method for CORS", async () => {
        const req = {
            method: 'OPTIONS',
        } as any;

        let statusCode = 200;
        let responseBody: any = null;
        const headers: Record<string, string> = {};

        const res = {
            set: (k: string, v: string) => {
                headers[k] = v;
            },
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(204);
        expect(headers['Access-Control-Allow-Methods']).toBe('POST');
    });
});

describe("Orchestrator Cloud Function (Mocked LLM DAG Cycle Test)", () => {
    let originalParse: typeof llm.parseIntentToManifest;

    beforeAll(() => {
        originalParse = llm.parseIntentToManifest;
    });

    afterAll(() => {
        mock.restore();
    });

    test("Cyclic DAG → rejection test in handler", async () => {
        // Mock parseIntentToManifest for this test only
        mock.module('./llm', () => ({
            parseIntentToManifest: async (intent: string, availableSkills: string[]): Promise<SwarmManifest> => {
                return {
                    version: "1.0",
                    intent_parsed: "Cycle test",
                    skills_required: ['generic-web-search'],
                    credentials_required: [],
                    steps: [
                        { id: 'step_1', description: 'A', worker: 'w_a', skills: ['generic-web-search'], credentials: [], depends_on: ['step_2'], action_type: 'READ' },
                        { id: 'step_2', description: 'B', worker: 'w_b', skills: ['generic-web-search'], credentials: [], depends_on: ['step_1'], action_type: 'READ' }
                    ]
                };
            }
        }));

        // Re-require the handler to ensure the mock is picked up
        const { orchestratorHandler } = require('./orchestrator');

        const req = {
            method: 'POST',
            body: {
                prompt: "Test cycle",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(400);
        expect(responseBody.error).toBe('Generated manifest failed validation.');

        // Cleanup module mock for next tests
        mock.module('./llm', () => ({
             parseIntentToManifest: originalParse
        }));
    });
});

describe("Manifest Validation Unit Tests", () => {
    test("accepts valid manifest", () => {
        const validManifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a', 'skill-b'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: [], action_type: 'READ' },
                { id: 'step_2', description: 'B', worker: 'w_b', skills: ['skill-b'], credentials: [], depends_on: ['step_1'], action_type: 'WRITE' }
            ]
        };
        const availableSkills = ['skill-a', 'skill-b'];

        expect(validateManifest(validManifest, availableSkills)).toBe(true);
    });

    test("rejects manifest with unknown skill", () => {
        const manifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['unknown-skill'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['unknown-skill'], credentials: [], depends_on: [], action_type: 'READ' },
            ]
        };
        const availableSkills = ['skill-a', 'skill-b'];

        expect(validateManifest(manifest, availableSkills)).toBe(false);
    });

    test("rejects manifest with cycle in DAG", () => {
        const manifestWithCycle: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: ['step_2'], action_type: 'READ' },
                { id: 'step_2', description: 'B', worker: 'w_b', skills: ['skill-a'], credentials: [], depends_on: ['step_1'], action_type: 'WRITE' }
            ]
        };
        const availableSkills = ['skill-a'];

        expect(validateManifest(manifestWithCycle, availableSkills)).toBe(false);
    });

    test("rejects manifest with missing dependency", () => {
        const manifestMissingDep: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: ['step_does_not_exist'], action_type: 'READ' },
            ]
        };
        const availableSkills = ['skill-a'];

        expect(validateManifest(manifestMissingDep, availableSkills)).toBe(false);
    });
});

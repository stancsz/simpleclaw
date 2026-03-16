import { expect, test, describe } from "bun:test";
import * as ff from '@google-cloud/functions-framework';

// Import to register the function
import './orchestrator';

describe("Orchestrator Cloud Function", () => {
    test("handles valid POST request with shopify and slack intent", () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "every night Get shopify orders and post to slack",
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

        // Get the handler directly for testing
        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody).toBeDefined();
        expect(responseBody.status).toBe('success');
        expect(responseBody.plan).toBeDefined();
        expect(responseBody.plan.intent_parsed).toBe("every night Get shopify orders and post to slack");
        expect(responseBody.plan.schedule).toBe("0 2 * * *");
        expect(responseBody.plan.skills_required).toContain('shopify-order-sync');
        expect(responseBody.plan.skills_required).toContain('slack-digest-poster');
        expect(responseBody.plan.credentials_required).toContain('shopify_api_key');
        expect(responseBody.plan.credentials_required).toContain('slack_bot_token');
        expect(responseBody.plan.steps).toBeDefined();
        expect(responseBody.plan.steps.length).toBe(2);
        expect(responseBody.yaml).toBeDefined();
        expect(responseBody.yaml).toContain('intent_parsed: every night Get shopify orders and post to slack');
        expect(responseBody.yaml).toContain('action_type: READ');
        expect(responseBody.yaml).toContain('action_type: WRITE');
    });

    test("handles valid POST request with email intent", () => {
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody.plan.skills_required).toContain('gmail-drafter');
        expect(responseBody.plan.credentials_required).toContain('google_oauth_token');
        expect(responseBody.plan.steps.length).toBe(1);
    });

    test("handles valid POST request with generic intent", () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "Do something else",
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody.plan.skills_required).toContain('generic-web-search');
        expect(responseBody.plan.credentials_required).toHaveLength(0);
        expect(responseBody.plan.steps.length).toBe(1);
        expect(responseBody.plan.steps[0].action_type).toBe('READ');
    });

    test("rejects non-POST methods", () => {
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);
        expect(statusCode).toBe(405);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing prompt", () => {
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing user_id", () => {
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("handles OPTIONS method for CORS", () => {
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

        const { orchestratorHandler } = require('./orchestrator');

        orchestratorHandler(req, res);
        expect(statusCode).toBe(204);
        expect(headers['Access-Control-Allow-Methods']).toBe('POST');
    });
});

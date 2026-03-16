import { expect, test, describe } from "bun:test";
import * as ff from '@google-cloud/functions-framework';

// Import to register the function
import './orchestrator';

describe("Orchestrator Cloud Function", () => {
    test("handles valid POST request with intent", () => {
        const req = {
            method: 'POST',
            body: {
                intent: "Get shopify orders and post to slack"
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
        expect(responseBody.plan.intent).toBe("Get shopify orders and post to slack");
        expect(responseBody.plan.dag).toBeDefined();
        expect(responseBody.plan.dag.length).toBe(2);
        expect(responseBody.yaml).toBeDefined();
        expect(responseBody.yaml).toContain('intent: Get shopify orders and post to slack');
        expect(responseBody.yaml).toContain('action_type: READ');
        expect(responseBody.yaml).toContain('action_type: WRITE');
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

    test("rejects missing intent", () => {
        const req = {
            method: 'POST',
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

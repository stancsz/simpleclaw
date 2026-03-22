import { expect, test, describe } from "bun:test";
import { parseIntentToManifest } from "./llm";

describe("LLM parser configuration", () => {
    test("throws an error when no API key is set", async () => {
        const oldOpenAi = process.env.OPENAI_API_KEY;
        const oldDeepseek = process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;

        try {
            await parseIntentToManifest("do it", []);
            // Force a failure if the function somehow succeeds without keys
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error.message).toContain("Missing API key");
        } finally {
            if (oldOpenAi !== undefined) process.env.OPENAI_API_KEY = oldOpenAi;
            if (oldDeepseek !== undefined) process.env.DEEPSEEK_API_KEY = oldDeepseek;
        }
    });
});

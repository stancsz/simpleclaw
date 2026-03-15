import "dotenv/config";
import OpenAI from "openai";

export function createLLM() {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = process.env.MODEL || "deepseek-reasoner";

    if (!apiKey) {
        throw new Error("Missing DEEPSEEK_API_KEY or OPENAI_API_KEY");
    }

    const client = new OpenAI({
        apiKey,
        baseURL,
    });

    return {
        async generate(systemPrompt: string, userPrompt: string) {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            });
            return response.choices[0]?.message?.content || "";
        },
    };
}

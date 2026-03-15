import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface JulesTaskResult {
    success: boolean;
    prUrl?: string;
    message: string;
}

interface Source {
    name: string;
    id: string;
    githubRepo: {
        owner: string;
        repo: string;
    };
}

export class JulesClient {
    private apiBaseUrl: string;
    private apiKey?: string;

    constructor(config: { apiKey?: string; apiBaseUrl?: string } = {}) {
        this.apiKey = config.apiKey || process.env.JULES_API_KEY;
        this.apiBaseUrl =
            config.apiBaseUrl || "https://jules.googleapis.com/v1alpha";
    }

    private async getRepoInfo(): Promise<{
        owner: string;
        repo: string;
        branch: string;
    }> {
        try {
            const { stdout: remoteUrl } = await execAsync("git remote get-url origin");
            let owner = "",
                repo = "";
            const cleanUrl = remoteUrl.trim().replace(/\.git$/, "");

            if (cleanUrl.startsWith("http")) {
                const parts = cleanUrl.split("/");
                owner = parts[parts.length - 2];
                repo = parts[parts.length - 1];
            } else if (cleanUrl.includes(":")) {
                const parts = cleanUrl.split(":");
                if (parts[1].includes("/")) {
                    const path = parts[1].split("/");
                    owner = path[0];
                    repo = path[1];
                } else {
                    const path = parts[1].split("/");
                    owner = path[0];
                    repo = path[1];
                }
            }

            const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD");
            return {
                owner: owner || "stancsz",
                repo: repo || "simple-claw",
                branch: branch.trim() || "main"
            };
        } catch (e) {
            return { owner: "stancsz", repo: "simple-claw", branch: "main" };
        }
    }

    private async listSources(): Promise<Source[]> {
        let allSources: Source[] = [];
        let nextPageToken = "";

        do {
            const url = `${this.apiBaseUrl}/sources${nextPageToken ? `?pageToken=${nextPageToken}` : ""}`;
            const response = await fetch(url, {
                headers: {
                    "X-Goog-Api-Key": this.apiKey || "",
                },
            });
            if (!response.ok) {
                throw new Error(
                    `Failed to list sources: ${response.status} ${response.statusText} - ${await response.text()}`,
                );
            }
            const data: any = await response.json();
            allSources = allSources.concat(data.sources || []);
            nextPageToken = data.nextPageToken || "";
        } while (nextPageToken);

        return allSources;
    }

    private async createSession(
        sourceName: string,
        prompt: string,
        branch: string,
    ) {
        const url = `${this.apiBaseUrl}/sessions`;
        const body = {
            prompt,
            sourceContext: {
                source: sourceName,
                githubRepoContext: {
                    startingBranch: branch,
                },
            },
            automationMode: "AUTO_CREATE_PR",
            title: `Delegated: ${prompt.substring(0, 50)}`,
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": this.apiKey || "",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(
                `Failed to create session: ${response.status} ${response.statusText} - ${await response.text()}`,
            );
        }
        return await response.json();
    }

    async delegateTask(task: string): Promise<JulesTaskResult> {
        if (!this.apiKey) {
            return { success: false, message: "JULES_API_KEY not set" };
        }

        try {
            const { owner, repo, branch } = await this.getRepoInfo();
            const sources = await this.listSources();
            const source = sources.find(
                (s) => s.githubRepo.owner === owner && (s.githubRepo.repo === repo || s.githubRepo.repo === "simple-claw"),
            );

            if (!source) {
                return {
                    success: false,
                    message: `Repository ${owner}/${repo} not found in Jules sources.`,
                };
            }

            const session = await this.createSession(source.name, task, branch);
            return {
                success: true,
                message: `Jules session created: ${session.name}. Task delegated.`,
            };
        } catch (error: any) {
            return { success: false, message: `Jules delegation failed: ${error.message}` };
        }
    }
}

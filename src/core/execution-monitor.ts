import { DBClient } from "../db/client";
import { SwarmManifest, Task } from "./types";
import { executeSwarmManifest } from "./dispatcher";
import { WorkerResult } from "../workers/template";

/**
 * ExecutionMonitor polls the database for worker execution status,
 * aggregates results from parallel workers, handles DAG dependency resolution,
 * and updates the orchestrator session state.
 *
 * This implementation wraps `executeSwarmManifest` and provides polling abstractions
 * mimicking how the Next.js `ExecutionMonitor` component checks `/api/results`.
 */
export class ExecutionMonitor {
    private db: DBClient;
    private sessionId: string;
    private isPolling: boolean = false;
    private pollInterval: NodeJS.Timeout | null = null;

    constructor(db: DBClient, sessionId: string) {
        this.db = db;
        this.sessionId = sessionId;
    }

    /**
     * Start an execution from a manifest and poll for real-time updates.
     */
    public async startAndMonitor(
        manifest: SwarmManifest,
        onProgress?: (results: any[]) => void
    ): Promise<Record<string, WorkerResult>> {
        // We start the execution loop asynchronously
        const executionPromise = executeSwarmManifest(manifest, this.sessionId, this.db);

        // Ensure status is executing
        this.db.updateSessionStatus(this.sessionId, "running");

        this.startPolling(onProgress);

        try {
            const finalResults = await executionPromise;
            return finalResults;
        } catch (error) {
            console.error("Execution failed:", error);
            throw error;
        } finally {
            this.stopPolling();
            const finalSession = this.db.getSession(this.sessionId);
            // executeSwarmManifest sets it to completed or error. We'll ensure onProgress is called one last time.
            if (onProgress) {
                const finalDbResults = this.getTaskResults();
                onProgress(finalDbResults);
            }
        }
    }

    /**
     * Poll the database for updates
     */
    private startPolling(onProgress?: (results: any[]) => void) {
        if (this.isPolling) return;
        this.isPolling = true;

        this.pollInterval = setInterval(() => {
            if (!this.isPolling) {
                if (this.pollInterval) clearInterval(this.pollInterval);
                return;
            }

            const currentResults = this.getTaskResults();
            if (onProgress) {
                onProgress(currentResults);
            }

            const session = this.db.getSession(this.sessionId);
            if (session?.status === "completed" || session?.status === "error") {
                this.stopPolling();
            }
        }, 1000); // Poll every 1 second
    }

    private stopPolling() {
        this.isPolling = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Retrieves current task results directly from the DB
     */
    public getTaskResults(): any[] {
        try {
            const results = this.db.getTaskResults(this.sessionId);
            return results.map((row: any) => ({
                ...row,
                output: typeof row.output === "string" ? JSON.parse(row.output) : row.output
            }));
        } catch (e) {
            // Ignore if mocking doesn't support it
        }
        return [];
    }
}

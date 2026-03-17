import "dotenv/config";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { startRuntime } from "../../src/core/runtime.ts";
import type { RuntimeDispatchEvent } from "../../src/core/dispatcher.ts";

async function main() {
    console.log(chalk.blue.bold("SimpleClaw Job: Initializing..."));

    // Configure Git Identity
    try {
        console.log(chalk.cyan("Setting up git identity..."));
        execSync('git config --global user.name "SimpleClaw"');
        execSync('git config --global user.email "simpleclaw@users.noreply.github.com"');
        console.log(chalk.green("Git identity configured as 'SimpleClaw'."));
    } catch (e) {
        console.warn(chalk.yellow("Warning: Failed to configure git identity. Background commits might fail."));
    }

    const objective = process.env.OBJECTIVE;
    if (!objective) {
        console.error(chalk.red("Error: OBJECTIVE environment variable is required."));
        process.exit(1);
    }

    const model = process.env.AGENT_MODEL || "deepseek-reasoner";
    const maxIterations = parseInt(process.env.MAX_ITERATIONS || "10", 10);

    console.log(chalk.cyan(`Objective: ${objective}`));
    console.log(chalk.gray(`[Config] Model: ${model}, Max Iterations: ${maxIterations}`));

    const runtime = await startRuntime({ mode: "cli" });

    try {
        console.log(chalk.cyan("Starting agent loop..."));
        
        const result = await runtime.submitWork({
            source: "standalone-worker",
            scope: "global",
            prompt: objective,
            model: model,
            maxIterations: maxIterations,
            onEvent: (event: RuntimeDispatchEvent) => {
                switch (event.type) {
                    case "iterationStarted":
                        console.log(chalk.yellow(`\n--- Iteration ${event.iteration} ---`));
                        break;
                    case "toolStarted":
                        console.log(chalk.magenta(`Using tool: ${event.toolName}`));
                        if (Object.keys(event.args).length > 0) {
                            console.log(chalk.gray(`   Args: ${JSON.stringify(event.args)}`));
                        }
                        break;
                    case "toolCompleted":
                        console.log(chalk.green(`Tool ${event.toolName} completed.`));
                        break;
                    case "toolFailed":
                        console.log(chalk.red(`Tool ${event.toolName} failed: ${event.error}`));
                        break;
                    case "finalResponse":
                        console.log(chalk.blue.bold("\n--- Final Response ---"));
                        console.log(event.content);
                        break;
                    case "workerDelegationStarted":
                        console.log(chalk.cyan(`Delegating to ${event.worker}: ${event.objective}`));
                        break;
                    case "workerDelegationCompleted":
                        console.log(chalk.cyan(`Worker ${event.worker} ${event.status}: ${event.summary}`));
                        break;
                }
            }
        });

        console.log(chalk.green.bold("\nTask completed successfully."));
    } catch (error) {
        console.error(chalk.red("Fatal error during execution:"), error);
        process.exit(1);
    } finally {
        await runtime.close();
    }
}

main().catch((err) => {
    console.error(chalk.red("Fatal Error:"), err);
    process.exit(1);
});

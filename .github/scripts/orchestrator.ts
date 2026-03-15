import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createLLM } from "./deepseek.js";
import { JulesClient } from "./jules.js";
import chalk from "chalk";

async function main() {
    console.log(chalk.blue.bold("🤖 SimpleClaw Smart Job Delegator: Initializing..."));

    console.log(chalk.cyan("🔍 Fetching latest state from main..."));
    execSync("git fetch origin main");
    const claudeMd = execSync("git show origin/main:CLAUDE.md", { encoding: "utf-8" });
    const specMd = execSync("git show origin/main:SPEC.md", { encoding: "utf-8" });
    const swarmSpec = execSync("git show origin/main:SWARM_SPEC.md", { encoding: "utf-8" });

    console.log(chalk.cyan("🔍 Fetching open Pull Requests..."));
    let prsJson = "";
    try {
        prsJson = execSync("gh pr list --json number,title,author,headRefName --state open", { encoding: "utf-8" });
    } catch (e) {
        console.warn(chalk.yellow("⚠️ Failed to fetch PRs using gh CLI. Proceeding without PR context."));
    }
    const prs = prsJson ? JSON.parse(prsJson) : [];

    const llm = createLLM();
    const model = process.env.MODEL || "deepseek-reasoner";
    console.log(chalk.gray(`[Config] Using model: ${model}`));

    const systemPrompt = `You are the "Principal Orchestrator" for the SimpleClaw project.
Your mission is to guide the evolution of SimpleClaw into a world-class meta-orchestrator.

### PROJECT CONTEXT:
1. **MISSION & ARCHITECTURE (CLAUDE.md)**:
${claudeMd}

2. **ENGINEERING SUMMARY (SPEC.md)**:
${specMd}

3. **DETAILED SPECIFICATION (SWARM_SPEC.md)**:
${swarmSpec}

4. **ACTIVE WORK (Open PRs)**:
${JSON.stringify(prs)}

### YOUR OBJECTIVE:
Analyze the current state of the project and identify the absolute NEXT meaningful step.
Delegated work MUST be meaningful and advance the project towards the "Beautiful Swarms" vision.

### RULES:
1. **CLAUDE.md AUDIT**: Read the "BACKLOG" and "CURRENT TASK" sections in CLAUDE.md first. 
2. **NO DUPLICATION**: Do not delegate tasks that are already being worked on in open PRs.
3. **HIGH-DETAIL DELEGATION**: Your instructions for the sub-agent ("Jules") should be crystal clear.
    - **Goal**: What exactly should be achieved.
    - **Files to touch**: Specific paths based on the structure.
    - **CLAUDE.md Update**: Explicitly instruct Jules to read CLAUDE.md, pick up the task, and update the "AGENT WORKSPACE" and "BACKLOG" sections after completion.
4. **FORMAT**: Output EXACTLY 1 task in JSON format.

### OUTPUT FORMAT (JSON ONLY):
{
  "thought": "A detailed reasoning about why this task is the priority.",
  "task": {
    "description": "Comprehensive instructions for Jules. Start with: 'Jules, your task is...'",
    "priority": "high"
  },
  "should_delegate": true
}`;

    console.log(chalk.cyan("🧠 Reasoning about the next steps..."));
    const response = await llm.generate(systemPrompt, "What is the absolute next task we should delegate to Jules?");

    let decision;
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON block found in LLM response");
        decision = JSON.parse(jsonMatch[0]);
    } catch (e: any) {
        console.error(chalk.red("❌ Failed to parse LLM decision:"), e.message);
        console.log(chalk.gray("Raw Output:"), response);
        process.exit(1);
    }

    console.log(chalk.green.bold("\n--- Decision ---"));
    console.log(chalk.white("Rationale:"), decision.thought);

    if (decision.should_delegate && decision.task) {
        console.log(chalk.white("\nNext Task:"), chalk.yellow(decision.task.description));
        
        // Delegation via Jules
        console.log(chalk.cyan("📤 Delegating to Jules via API..."));
        
        const jules = new JulesClient();
        const instruction = `${decision.task.description}\n\nIMPORTANT: Read CLAUDE.md first. Update the AGENT WORKSPACE with your progress and mark tasks as done in the BACKLOG if applicable. Provide a clear summary of your work for the reviewer.`;
        
        const result = await jules.delegateTask(instruction);

        if (result.success) {
            console.log(chalk.green.bold("✅ Success:"), result.message);
        } else {
            console.error(chalk.red("❌ Jules delegation failed:"), result.message);
            process.exit(1);
        }
    } else {
        console.log(chalk.yellow("⏸️ Decision: No new tasks to delegate at this time."));
    }
}

main().catch((err) => {
    console.error(chalk.red("Fatal Error:"), err);
    process.exit(1);
});

import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createLLM } from "./deepseek.js";
import chalk from "chalk";

async function main() {
    console.log(chalk.blue.bold("🔍 SimpleClaw Smart Code Review & Merge: Initializing..."));

    // 1. Fetch Open PRs
    console.log(chalk.cyan("Fetching open PRs..."));
    let prsJson = "";
    try {
        prsJson = execSync("gh pr list --json number,title,author,headRefName,mergeable --state open", { encoding: "utf-8" });
    } catch (e) {
        console.error(chalk.red("❌ Failed to fetch PRs. Make sure gh CLI is installed and authenticated."));
        process.exit(1);
    }

    const prs = JSON.parse(prsJson);
    if (prs.length === 0) {
        console.log(chalk.green("✅ No open PRs found."));
        return;
    }

    const llm = createLLM();

    for (const pr of prs) {
        console.log(chalk.white(`\n---------------------------------------------------`));
        console.log(chalk.white(`PR #${pr.number}: ${pr.title}`));
        console.log(chalk.gray(`Author: ${pr.author?.login || 'unknown'}`));

        if (pr.mergeable !== "MERGEABLE") {
            console.log(chalk.yellow(`⚠️ PR #${pr.number} is not mergeable (conflicts). Closing...`));
            execSync(`gh pr close ${pr.number} --comment "Closing PR because it has merge conflicts with the main branch. Please resolve conflicts and try again."`);
            continue;
        }

        // Checkout PR to examine it
        console.log(chalk.cyan(`Checking out PR #${pr.number}...`));
        execSync(`gh pr checkout ${pr.number}`);
        
        console.log(chalk.cyan("🔍 Fetching mission parameters (CLAUDE.md & SPEC.md) from development..."));
        execSync("git fetch origin development");
        const claudeMd = execSync("git show origin/development:CLAUDE.md", { encoding: "utf-8" });
        const specMd = execSync("git show origin/development:SPEC.md", { encoding: "utf-8" });
        
        // Get diff against development
        const diff = execSync("git diff origin/origin/development...HEAD", { encoding: "utf-8" });

        const systemPrompt = `You are the "Principal Integrity Officer" for SimpleClaw.
Your job is to review Pull Requests and decide whether to MERGE or CLOSE them.

### DECISION CRITERIA:
1. **Meaningful Work**: Does this PR actually advance the mission described in CLAUDE.md?
2. **Architecture Compliance**: Does the code follow the rules in SPEC.md (e.g., Bun, stateless, GCP KMS)?
3. **No Technical Debt**: Reject PRs with 'TODO', 'FIXME', or obvious placeholders/stubs.
4. **Verification**: Is there evidence of testing in the code or a validation log in the PR?
5. **CLAUDE.md Update**: Did Jules (the sub-agent) update CLAUDE.md correctly?

### PROJECT CONTEXT:
- **CLAUDE.md (Mission/Workplace)**:
${claudeMd}

- **SPEC.md (Engineering Rules)**:
${specMd}

### PR DIFF:
${diff}

### OUTPUT FORMAT (JSON ONLY):
{
  "thought": "Deep reasoning for the decision (internal).",
  "decision": "merge" | "close",
  "summary": "A 1-sentence punchy summary of the impact (e.g., 'Implemented KMS encryption for worker secrets').",
  "comment": "Final public review comment for the PR, explaining the decision clearly."
}`;

        console.log(chalk.cyan(`🧠 Reviewing PR #${pr.number}...`));
        const reviewResponse = await llm.generate(systemPrompt, `Should we merge PR #${pr.number}?`);

        let review;
        try {
            const jsonMatch = reviewResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON block found");
            review = JSON.parse(jsonMatch[0]);
        } catch (e: any) {
            console.error(chalk.red("❌ Review failed for PR #" + pr.number));
            continue;
        }

        console.log(chalk.white("Decision:"), review.decision === "merge" ? chalk.green("MERGE") : chalk.red("CLOSE"));
        console.log(chalk.gray("Rationale:"), review.thought);

        // 1. Post the LLM-generated review comment first
        console.log(chalk.cyan("💬 Posting review comment..."));
        try {
            const commentFile = path.resolve(process.cwd(), "pr_comment.tmp");
            fs.writeFileSync(commentFile, review.comment);
            execSync(`gh pr comment ${pr.number} -F "${commentFile}"`);
            fs.unlinkSync(commentFile);
        } catch (e) {
            console.warn(chalk.yellow("⚠️ Failed to post comment, proceeding anyway."));
        }

        if (review.decision === "merge") {
            // Update CLAUDE.md with a merge note if requested
            console.log(chalk.cyan("Merging PR (Squash Mode)..."));
            execSync(`gh pr merge ${pr.number} --squash --delete-branch`);
            
            // Go back to development
            execSync("git checkout development");
            execSync("git pull origin development");
            
            // Note: If we want to add a note to CLAUDE.md on development AFTER merge:
            const claudeMdPath = path.resolve(process.cwd(), "CLAUDE.md");
            const updatedClaudeMd = fs.readFileSync(claudeMdPath, "utf-8");
            const date = new Date().toISOString().split('T')[0];
            const timestamp = new Date().toISOString().split('T')[1].substring(0, 5);
            // Use the LLM-generated summary for a better history log
            const note = `\n- [${date} ${timestamp}] Cycle Merged: ${review.summary} (#${pr.number})`;
            
            // Find the AGENT WORKSPACE section
            const newContent = updatedClaudeMd.replace("## AGENT WORKSPACE (MODIFIABLE BY AGENT)", `## AGENT WORKSPACE (MODIFIABLE BY AGENT)${note}`);
            fs.writeFileSync(claudeMdPath, newContent);
            
            execSync('git add CLAUDE.md');
            execSync(`git commit -m "docs: Note merge of PR #${pr.number} in CLAUDE.md"`);
            execSync('git push origin development');
            
            console.log(chalk.green("✅ PR Merged and CLAUDE.md updated."));
        } else {
            console.log(chalk.cyan("Closing PR..."));
            execSync(`gh pr close ${pr.number} --comment "Closing based on review: ${review.comment}"`);
        }

        // Clean up and back to development
        execSync("git checkout development");
    }
}

main().catch((err) => {
    console.error(chalk.red("Fatal Error:"), err);
    process.exit(1);
});

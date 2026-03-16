import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createLLM } from "./deepseek.js";
import chalk from "chalk";

async function main() {
    console.log(chalk.blue.bold("🔍 SimpleClaw Smart Code Review & Merge: Initializing..."));

    // 0. Setup Git Identity
    console.log(chalk.cyan("Setting up git identity..."));
    execSync('git config --global user.name "simpleclaw"');
    execSync('git config --global user.email "simpleclaw@users.noreply.github.com"');

    // 1. Fetch Open PRs
    console.log(chalk.cyan("Fetching open PRs..."));
    let prsJson = "";
    try {
        // Fetch all open PRs
        prsJson = execSync("gh pr list --json number,title,author,headRefName,mergeable,baseRefName --state open", { encoding: "utf-8" });
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
        
        console.log(chalk.cyan(`🔍 Fetching mission parameters from ${pr.baseRefName}...`));
        execSync(`git fetch origin ${pr.baseRefName}`);
        const claudeMd = execSync(`git show origin/${pr.baseRefName}:CLAUDE.md`, { encoding: "utf-8" });
        const specMd = execSync(`git show origin/${pr.baseRefName}:SPEC.md`, { encoding: "utf-8" });
        
        // Get diff against the PR's target base
        const diff = execSync(`git diff origin/${pr.baseRefName}...HEAD`, { encoding: "utf-8" });

        // Read test results if they exist
        let testResults = "No test results available.";
        const testResultsPath = path.resolve(process.cwd(), "test_results.log");
        if (fs.existsSync(testResultsPath)) {
            testResults = fs.readFileSync(testResultsPath, "utf-8");
            console.log(chalk.cyan(`📝 Including test results (size: ${testResults.length} bytes)...`));
        }

        if (!diff.trim()) {
            console.log(chalk.yellow(`⚠️ PR #${pr.number} has no diff against development. Skipping...`));
            continue;
        }

        const systemPrompt = `You are the "Principal Integrity Officer" for SimpleClaw.
Your job is to review Pull Requests and decide whether to MERGE, CLOSE, or FIX them.

### DECISION CRITERIA:
1. **Meaningful Work**: Does this PR actually advance the mission described in CLAUDE.md?
2. **Architecture Compliance**: Does the code follow the rules in SPEC.md (e.g., Bun, stateless, GCP KMS)?
3. **No Technical Debt**: Reject PRs with 'TODO', 'FIXME', or obvious placeholders/stubs.
4. **Verification**: Is there evidence of testing in the code or a validation log in the PR?
5. **CLAUDE.md Update**: Did Jules (the sub-agent) update CLAUDE.md correctly?
6. **STRICT ISOLATION**: REJECT any PR that modifies files in the '.github' directory. This directory is reserved for human orchestration rules.

### HUMAN-LIKE BEHAVIOR:
- **Proactive & Independent**: Like a senior engineer, don't just be a passive gatekeeper. If you see small issues that prevent merging (lint, missing imports, typos, small bugs), use the 'fix' decision to provide corrections. 
- **Mission First**: Your primary goal is to advance the mission. If a PR is 90% there and helpful, FIX it and MERGE it. Only CLOSE if it's fundamentally broken, harmful, or out of scope.

### DECISION TYPES:
- **merge**: PR is high quality and ready to go.
- **close**: PR is fundamentally flawed, off-mission, or violates security rules.
- **fix**: PR is 90% there but has small errors (lint, small logic bugs, typos, missing imports). Choose this to automatically apply fixes and merge.

### PROJECT CONTEXT:
- **CLAUDE.md (Mission/Workplace)**:
${claudeMd}

- **SPEC.md (Engineering Rules)**:
${specMd}

### PR DIFF:
${diff}

### TEST RESULTS:
${testResults}

### OUTPUT FORMAT (JSON ONLY):
{
  "thought": "Deep reasoning for the decision (internal).",
  "decision": "merge" | "close" | "fix",
  "summary": "A 1-sentence punchy summary of the impact.",
  "comment": "Final public review comment for the PR.",
  "fixes": [
    {
      "file": "relative/path/to/file",
      "explanation": "Why this fix is needed.",
      "original": "Exact string to be replaced. Must be unique in the file.",
      "replacement": "New string to insert."
    }
  ]
} (If decision is not 'fix', leave 'fixes' as an empty array [])`;

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

        console.log(chalk.white("Decision:"), 
            review.decision === "merge" ? chalk.green("MERGE") : 
            review.decision === "fix" ? chalk.blue("FIX & MERGE") : chalk.red("CLOSE"));
        console.log(chalk.gray("Rationale:"), review.thought);

        if (review.decision === "merge" || review.decision === "fix") {
            if (review.decision === "fix" && review.fixes && review.fixes.length > 0) {
                console.log(chalk.blue(`🛠️  Applying ${review.fixes.length} fixes...`));
                for (const fix of review.fixes) {
                    try {
                        const filePath = path.resolve(process.cwd(), fix.file);
                        if (!fs.existsSync(filePath)) {
                            console.warn(chalk.yellow(`⚠️ File not found: ${fix.file}`));
                            continue;
                        }
                        let content = fs.readFileSync(filePath, "utf-8");
                        if (!content.includes(fix.original)) {
                            console.warn(chalk.yellow(`⚠️ Could not find original text in ${fix.file}. Skipping this fix.`));
                            continue;
                        }
                        content = content.replace(fix.original, fix.replacement);
                        fs.writeFileSync(filePath, content);
                        console.log(chalk.gray(`  - Fixed: ${fix.file} (${fix.explanation})`));
                    } catch (e: any) {
                        console.error(chalk.red(`❌ Failed to apply fix to ${fix.file}: ${e.message}`));
                    }
                }

                // Commit the fixes
                try {
                    execSync('git add .');
                    execSync(`git commit -m "fix: Applied automated improvements during code review"`);
                    console.log(chalk.cyan(`Pushing fixes to ${pr.headRefName}...`));
                    execSync(`git push origin HEAD:${pr.headRefName}`);
                } catch (e: any) {
                    console.warn(chalk.yellow(`⚠️ Failed to push fixes: ${e.message}`));
                }
            }

            // Post the LLM-generated review comment as an approval log
            console.log(chalk.cyan("💬 Posting review comment..."));
            try {
                const commentFile = path.resolve(process.cwd(), "pr_comment.tmp");
                fs.writeFileSync(commentFile, review.comment);
                execSync(`gh pr comment ${pr.number} -F "${commentFile}"`);
                fs.unlinkSync(commentFile);
            } catch (e) {
                console.warn(chalk.yellow("⚠️ Failed to post comment."));
            }

            // Update CLAUDE.md with a merge note if requested
            console.log(chalk.cyan("Merging PR (Squash Mode)..."));
            execSync(`gh pr merge ${pr.number} --squash --delete-branch`);
            
            // Go back to the base branch
            execSync(`git checkout ${pr.baseRefName}`);
            execSync(`git pull origin ${pr.baseRefName}`);
            
            // Update CLAUDE.md with a merge note
            const claudeMdPath = path.resolve(process.cwd(), "CLAUDE.md");
            const date = new Date().toISOString().split('T')[0];
            const timestamp = new Date().toISOString().split('T')[1].substring(0, 5);
            // Use the LLM-generated summary for a better history log
            const note = `\n- [${date} ${timestamp}] Cycle Merged: ${review.summary} (#${pr.number})`;

            try {
                // Find the AGENT WORKSPACE section - support both # and ## headers
                const headerRegex = /^(#+)\s*AGENT WORKSPACE \(MODIFIABLE BY AGENT\)/m;
                let newContent = fs.readFileSync(claudeMdPath, "utf-8");
                
                if (headerRegex.test(newContent)) {
                    newContent = newContent.replace(headerRegex, (match) => `${match}${note}`);
                    fs.writeFileSync(claudeMdPath, newContent);
                    
                    const diffCheck = execSync('git diff CLAUDE.md', { encoding: 'utf-8' });
                    if (diffCheck.trim()) {
                        execSync('git add CLAUDE.md');
                        execSync(`git commit -m "docs: Note merge of PR #${pr.number} in CLAUDE.md"`);
                        console.log(chalk.cyan(`Pushing CLAUDE.md update to ${pr.baseRefName}...`));
                        execSync(`git push origin ${pr.baseRefName}`);
                        console.log(chalk.green("✅ PR Merged and CLAUDE.md updated."));
                    }
                } else {
                    console.warn(chalk.yellow("⚠️ Could not find AGENT WORKSPACE section in CLAUDE.md. Skipping history update."));
                }
            } catch (pushError: any) {
                console.warn(chalk.red(`⚠️ Failed to update CLAUDE.md (likely branch protection on ${pr.baseRefName}):`), pushError.message);
                console.log(chalk.yellow("Proceeding as the PR was already merged successfully."));
            }
        } else {
            console.log(chalk.cyan("Closing PR..."));
            const commentFile = path.resolve(process.cwd(), "pr_comment.tmp");
            fs.writeFileSync(commentFile, review.comment);
            // Post comment first (which supports -F)
            execSync(`gh pr comment ${pr.number} -F "${commentFile}"`);
            // Then close without redundancy
            execSync(`gh pr close ${pr.number}`);
            fs.unlinkSync(commentFile);
        }

        // Clean up and back to original base
        execSync(`git checkout ${pr.baseRefName}`);
    }
}

main().catch((err) => {
    console.error(chalk.red("Fatal Error:"), err);
    process.exit(1);
});

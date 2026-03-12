import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { executeNativeTool } from "../src/core/executor.ts";
import { loadPlugins } from "../src/core/loader.ts";

const rl = readline.createInterface({ input, output });

// ANSI Escape Codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const prefix = `${colors.cyan}${colors.bold}🦀 SimpleClaw >${colors.reset} `;

async function simulateThinking(message: string): Promise<() => void> {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  // Hide cursor
  process.stdout.write("\x1B[?25l");

  const timer = setInterval(() => {
    process.stdout.write(`\r${colors.magenta}${frames[i]} ${message}...${colors.reset}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(timer);
    // Clear line and show cursor
    process.stdout.write("\r\x1B[K\x1B[?25h");
  };
}

async function handleCommand(cmd: string, args: string[]) {
  const argStr = args.join(" ");
  switch (cmd) {
    case "/help":
      console.log(`
${colors.bold}Available Commands:${colors.reset}
  ${colors.green}/help${colors.reset}    - Show this help message
  ${colors.green}/exit${colors.reset}    - Exit the CLI
  ${colors.green}/clear${colors.reset}   - Clear the screen
  ${colors.green}/shell${colors.reset}   - Execute a shell command (e.g., /shell ls -la)
  ${colors.green}/git${colors.reset}     - Execute a git commit (e.g., /git "commit message")
  ${colors.green}/read${colors.reset}    - Read a file (e.g., /read path/to/file)
      `);
      break;
    case "/exit":
      console.log(`${colors.yellow}Goodbye!${colors.reset}`);
      process.exit(0);
      break;
    case "/clear":
      console.clear();
      break;
    case "/shell":
      if (!argStr) {
        console.log(`${colors.red}Error: Please provide a shell command.${colors.reset}`);
        return;
      }
      const stopShell = await simulateThinking("Executing shell command");
      try {
        const result = await executeNativeTool("shell", { cmd: argStr });
        stopShell();
        console.log(`${colors.dim}${result}${colors.reset}`);
      } catch (e: any) {
        stopShell();
        console.log(`${colors.red}Shell error: ${e.message}${colors.reset}`);
      }
      break;
    case "/git":
      if (!argStr) {
        console.log(`${colors.red}Error: Please provide a commit message.${colors.reset}`);
        return;
      }
      const stopGit = await simulateThinking("Running git commit");
      try {
        const result = await executeNativeTool("git", { msg: argStr });
        stopGit();
        console.log(`${colors.dim}${result}${colors.reset}`);
      } catch (e: any) {
        stopGit();
        console.log(`${colors.red}Git error: ${e.message}${colors.reset}`);
      }
      break;
    case "/read":
      if (!argStr) {
        console.log(`${colors.red}Error: Please provide a file path.${colors.reset}`);
        return;
      }
      const stopRead = await simulateThinking("Reading file");
      try {
        const result = await executeNativeTool("read", { path: argStr });
        stopRead();
        console.log(`${colors.dim}${result}${colors.reset}`);
      } catch (e: any) {
        stopRead();
        console.log(`${colors.red}Read error: ${e.message}${colors.reset}`);
      }
      break;
    default:
      console.log(`${colors.red}Unknown command: ${cmd}. Type /help for available commands.${colors.reset}`);
  }
}

async function handleChat(input: string) {
  const stopThinking = await simulateThinking("Thinking");
  // Simulate LLM delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  stopThinking();

  // Simulated generic response
  console.log(`${colors.green}${colors.bold}SimpleClaw:${colors.reset} I received your message: "${input}".
${colors.dim}Note: Full LLM integration requires core modifications (see docs/TODO.md). Use commands like /shell or /read to interact with tools.${colors.reset}`);
}

async function main() {
  console.clear();
  console.log(`${colors.blue}${colors.bold}🦀 SimpleClaw CLI v1.0${colors.reset}`);
  console.log(`${colors.dim}Type /help for available commands. Type /exit to quit.${colors.reset}\n`);

  // Ensure plugins are loaded so we can potentially use them via executeNativeTool fallback
  await loadPlugins();

  rl.on('close', () => {
    console.log(`\n${colors.yellow}Goodbye!${colors.reset}`);
    process.exit(0);
  });

  // Since we use rl.on('line') which doesn't block, we don't need a loop

  process.stdout.write(prefix);

  rl.on('line', async (line) => {
    rl.pause();
    try {
      const trimmed = line.trim();

      if (!trimmed) {
        process.stdout.write(prefix);
        rl.resume();
        return;
      }

      if (trimmed.startsWith("/")) {
        const [cmd, ...args] = trimmed.split(" ");
        await handleCommand(cmd, args);
      } else {
        await handleChat(trimmed);
      }

      process.stdout.write(prefix);
    } catch (err: any) {
      console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
      process.stdout.write(prefix);
    } finally {
      rl.resume();
    }
  });
}

// Handle interrupt signal (Ctrl+C)
process.on("SIGINT", () => {
  // Restore cursor visibility if interrupted during a spinner
  process.stdout.write("\x1B[?25h");
  console.log(`\n${colors.yellow}Goodbye!${colors.reset}`);
  process.exit(0);
});

main().catch((err) => {
  console.error(`${colors.red}Fatal error: ${err}${colors.reset}`);
  process.exit(1);
});

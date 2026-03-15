# 🦀 SimpleClaw

**The featherweight agent with heavyweight power.**

<img src="docs/image.png" alt="SimpleClaw Logo" width="200">

SimpleClaw is an ultra-lean "claw" agent designed to deliver **Claude Code-level autonomy** on a **Free Tier** budget. Optimized for AWS/GCP free instances, it bridges the gap between raw LLMs and real-world execution through native **Agentic Browsing**, **MCP** integration, and a modular **Skill** vault.

> [!IMPORTANT]
> **Quick Start:** One-command installation:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/stancsz/simpleclaw/main/setup.sh | bash
> ```
> Or download and run:
> ```bash
> ./setup.sh
> ```

> [!TIP]
> **⚡ 121 Lines of Pure Power.** The core engine in `src/core` is so lean, it fits in just 121 lines of dense, optimized code.
>
> SimpleClaw is one of the very few **OpenCLAW-equivalent** frameworks that delivers high-tier agentic browser automation and advanced tools without demanding heavy infrastructure.


---

## 🚀 Key Features

- **🌐 Agentic Browser**: Integrated `agent-browser` capabilities allow your AI to navigate the web, interact with elements, and extract data just like a human.
- **🛠️ Modular Plugins**: Easily extend capabilities with plugins for **Discord**, **WhatsApp**, **Messenger**, and more.
- **🧠 Skill System**: Inject specialized knowledge or workflows via Markdown files in the `.agents/skills/` directory. Supports Anthropic-style `SKILL.md` format.
- **🐳 Cloud Ready**: Pre-configured Terraform and Docker setups for "Free Tier" deployment on Google Cloud.
- **🔒 Security First**: Integrated **Triple Lock** security and IPI sanitization for AI safety.
- **💾 Local First**: Zero-config SQLite support for rapid development without complex database setups.

---

## 📂 Project Structure

- `cli/`: LLM-integrated terminal interface for interacting with your agent.
- `src/core/`: The "Brain" and execution logic of the framework.
- `src/plugins/`: Extensible tools and platform integrations (Browser, Discord, etc.).
- `.agents/skills/`: Markdown-based expertise for the agent (e.g., Exploratory Testing).
- `terraform/`: Infrastructure-as-Code for GCP Free Tier deployment.
- `server/`: Next.js management dashboard for bot orchestration.

---

## 🛠️ Getting Started

### 1. Local Development
```bash
# One-command setup
./setup.sh

# Or manually:
# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY or DEEPSEEK_API_KEY

# Start SimpleClaw
bun run start
```

### 2. Deployment
Ready to go live? Check our [Setup & Deployment Guide](docs/setup_guide.md).

---

## 📖 Documentation

- [Setup & GCP Deployment Strategy](docs/setup_guide.md)
- [How to add Agent Skills](.agents/skills/README.md)
- [Browser Skill Documentation](.agents/skills/browser.md)

---

## 🧩 Default Skills

The following skills are pre-installed in the `.agents/skills/` vault:
- **Web Browsing**: Full-page navigation and interaction.
- **Dogfooding**: Exploratory QA testing for web apps.
- **Shell Management**: Advanced system operations.

---

*SimpleClaw is built for speed, safety, and autonomy. Join the swarm. 🦀*

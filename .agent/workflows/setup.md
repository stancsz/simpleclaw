---
description: Fast setup for SimpleClaw with Agentic Browser and GCP infra
---

# SimpleClaw Setup Workflow
Use this workflow to quickly bootstrap SimpleClaw for local or cloud deployment.

// turbo-all
1. Install dependencies
```bash
npm install # or bun install
```

2. Initialize environment
```bash
cp .env.example .env
```

3. Initialize Infrastructure (Optional)
If you want to deploy to GCP:
```bash
cd terraform
terraform init
terraform apply -var="project_id=YOUR_PROJECT"
```

4. Launch Local CLI for Testing
```bash
npx tsx cli/index.ts
```

5. Run in Docker (Recommended for local dev)
The Docker setup now mounts `./src` as a volume, allowing for fast iterations.
```bash
# Start the bot worker in the background
docker compose up bot-worker -d

# Apply code changes without rebuilding (fast)
docker compose restart bot-worker

# Rebuild only if you change package.json or Dockerfile
docker compose up bot-worker -d --build
```

6. Run Management Server (Dev mode)
```bash
cd server
npm run dev
```

---

## 🧠 Cloud Deployment (GCP/AWS Free Tier) Learnings

Deploying to low-resource instances (like `e2-micro`) requires specific handling:

### 🛠 Challenges & Solutions

#### 1. Missing OS Dependencies
*   **Challenge**: Fresh Ubuntu images lack `unzip` (required for Bun) and various libraries for Playwright.
*   **Solution**: Run this preemptive install:
    ```bash
    sudo apt-get update && sudo apt-get install -y unzip curl git \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxfixes3 libxkbcommon0 libx11-6 \
    libxext6 libxrender1 libxshmfence1 libgl1
    ```

#### 2. Agent-Browser Daemon Lock
*   **Challenge**: "Daemon failed to start" error usually means a previous `agent-browser` session crashed and left a stale socket/process.
*   **Solution**: Clear the runtime directory and kill stale node processes:
    ```bash
    killall node || true
    rm -rf /run/user/$(id -u)/agent-browser/*
    ```

#### 3. Pathing in Non-Interactive Shells
*   **Challenge**: `gcloud ssh` commands don't load `.bashrc`, so `bun` appears missing even after installation.
*   **Solution**: Use absolute paths (`~/.bun/bin/bun`) or prepend the path in your command:
    ```bash
    export PATH="$HOME/.bun/bin:$PATH" && bun install
    ```

#### 3. Memory Constraints (OOM)
*   **Challenge**: Docker builds (especially Next.js builds) fail on 1GB RAM instances.
*   **Solution**: **Deploy Native (Bun)**. Bun's memory footprint is significantly lower than Node.js or Docker/BuildKit for this specific stack.
*   **Solution**: Always use a Swap file (Terraform `main.tf` now includes 2GB swap setup).

#### 4. "Already in Use" Port Ghosting
*   **Challenge**: Rerunning the worker often fails because port `3018` is held by a background process.
*   **Solution**: Kill the existing process before restart:
    ```bash
    sudo lsof -t -i:3018 | xargs sudo kill -9 || true
    ```

#### 5. Plugin Bootstrapping
*   **Challenge**: Adding plugin files to `src/plugins` isn't enough; they must be registered.
*   **Solution**: Ensure `src/index.ts` (the entrypoint) explicitly calls `await loadPlugins()` before starting the server. Without this, Gateway bots (Discord) will stay offline.

#### 6. Multi-Env Synchronization
*   **Challenge**: The framework uses a root `.env` for the worker and a `server/.env` for the Next.js dashboard.
*   **Solution**: When updating credentials (like Discord Channel IDs), both files must be updated. On cloud VMs, remember to sync both:
    ```bash
    cp ~/simpleclaw/.env ~/simpleclaw/server/.env
    ```

#### 7. Discord Gateway Protocol
*   **Challenge**: Bot logs in but doesn't "see" or respond to messages.
*   **Requirement**: You MUST enable **"Message Content Intent"** in the [Discord Developer Portal](https://discord.com/developers/applications) under the "Bot" tab. Without this, the bot is deaf.

#### 8. Child Process Environment
*   **Challenge**: Even if the main process starts correctly via `nohup`, child processes spawned via `execSync` (e.g., in plugins) might not inherit the necessary PATH for `bunx` or other binaries.
*   **Solution**: Explicitly inject the Bun bin path into the `env` options of the `exec` call within your plugin code.

#### 9. Remote Docker Deployment (GCR/DockerHub)
*   **Challenge**: Building Docker images on `e2-micro` (1GB RAM) will almost always freeze the VM or OOM.
*   **Solution**: **Build Locally, Push to Registry**.
    1.  Tag and push locally: `docker tag simpleclaw-bot:deploy gcr.io/YOUR_PROJECT/simpleclaw-bot:latest`
    2.  Push: `docker push gcr.io/YOUR_PROJECT/simpleclaw-bot:latest`
    3.  Pull on VM: `sudo docker-compose pull && sudo docker-compose up -d`
*   **Credential Tip**: If using `sudo docker-compose`, you must run `sudo gcloud auth configure-docker` so the root user has the registry keys.

#### 10. Disk Space Management
*   **Challenge**: 10GB-30GB root disks fill up quickly with Docker layers and logs.
*   **Solution**: Run `sudo docker system prune -af` regularly to clear build caches and dangling images.
*   **Solution**: Use a strict `.dockerignore` (exclude `.git`, `node_modules`, `terraform`, `docs`) to keep the build context small.

### 🚀 Recommended Headless Start

#### Option A: Docker (Stable Context)
```bash
sudo docker-compose pull && sudo docker-compose up -d
```

#### Option B: Native Bun (Lowest RAM)
```bash
# Run Worker (using absolute paths for reliability in nohup)
nohup /home/$USER/.bun/bin/bun run /home/$USER/simpleclaw/src/index.ts > /home/$USER/simpleclaw/worker.log 2>&1 &
```

#### Option C: PM2 (Self-Recoverable & Recommended)
PM2 provides auto-restart if the bot crashes.
```bash
npm install -g pm2
pm2 start "/home/$USER/.bun/bin/bun run /home/$USER/simpleclaw/src/index.ts" --name "simpleclaw-bot"
pm2 save
pm2 startup
```

# Run Dashboard
cd server && nohup /home/$USER/.bun/bin/bun run dev -- -p 3000 > server.log 2>&1 &
```

> [!TIP]
> Use `bun run dev` on free tiers even in "production" if the Next.js `build` process OOMs. It is surprisingly stable on low-RAM VPS and saves a massive amount of swap/disk space usage during the build phase.



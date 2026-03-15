# 🦀 SimpleClaw Setup Guide

This guide covers the process of deploying SimpleClaw to a Google Cloud Platform (GCP) Virtual Machine using Terraform and Docker.

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated.
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed.
- An OpenAI API Key.

## Phase 1: Infrastructure Deployment (Terraform)

We use Terraform to provision a "Free Tier" eligible `e2-micro` instance on GCP.

1.  **Authenticate GCP**:
    ```bash
    gcloud auth login
    gcloud auth application-default login
    ```

2.  **Configure Project**:
    ```bash
    gcloud config set project [YOUR_PROJECT_ID]
    ```

3.  **Initialize & Apply**:
    Navigate to the `terraform/` directory:
    ```bash
    cd terraform
    terraform init
    terraform apply -var="project_id=[YOUR_PROJECT_ID]"
    ```

4.  **Note the IP**: Terraform will output an `instance_ip`. This is your server's public address.

## Phase 2: Server Configuration

The Terraform script automatically installs Docker and sets up a **2GB Swap file**. The swap is critical because the `e2-micro` only has 1GB of RAM, and the Browser Skill requires more to run Chromium.

1.  **SSH into the VM**:
    ```bash
    gcloud compute ssh simpleclaw-app --zone=us-central1-a
    ```

2.  **Clone the Repository**:
    ```bash
    git clone https://github.com/stancsz/simpleclaw.git
    cd simpleclaw
    ```

3.  **Environment Variables**:
    Create a `.env` file from the example:
    ```bash
    cp .env.example .env
    nano .env
    ```
    Ensure `OPENAI_API_KEY` is set and `ENABLE_BROWSER=true`.

## Phase 3: Launching the Application (Production Flow)

Building Docker images directly on a 1GB RAM `e2-micro` instance is discouraged as it often leads to OOM (Out Of Memory) hangs. Instead, follow the **Build-Push-Pull** flow:

1.  **Configure GCR Locally**:
    ```bash
    gcloud auth configure-docker --quiet
    ```

2.  **Build and Tag Locally**:
    ```bash
    docker build -t gcr.io/[PROJECT_ID]/simpleclaw-bot:latest -f docker/Dockerfile .
    docker push gcr.io/[PROJECT_ID]/simpleclaw-bot:latest
    ```

3.  **Deploy on Server**:
    SSH into the VM and run:
    ```bash
    cd simpleclaw
    sudo docker-compose -f docker/docker-compose.yml pull
    sudo docker-compose -f docker/docker-compose.yml up -d
    ```

### 🛠️ Low-RAM Deployment (Learnings)

1.  **Native Bun Fallback**: If Docker is too heavy for your specific instance, run the worker natively using Bun. This uses ~150MB of RAM compared to ~1.2GB for a full Docker build/run cycle.
    ```bash
    nohup ~/.bun/bin/bun run src/index.ts > worker.log 2>&1 &
    ```
2.  **Anti-Bot Bypass**: If sites like Google block the bot, the Browser skill is optimized to:
    -   Rotate User-Agents randomly.
    -   Use direct navigation URLs (e.g., Google Flights search params) to skip CAPTCHA-heavy landing pages.
3.  **Discord Context**: The bot now automatically reads the last 10 messages in a channel, allowing it to maintain context (flight dates, user preferences) without asking redundant questions.
4.  **Local Dev Speed**: In local development, `docker-compose.yml` mounts the `./src` folder. You can apply code changes instantly using `docker-compose restart bot-worker` without a rebuild.

---
> [!TIP]
> Always run `sudo docker system prune -af` on the server periodically to reclaim disk space from old build layers.


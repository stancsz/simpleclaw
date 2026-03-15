#!/bin/bash
# AI NOTE: See .agents/workflows/setup.md for critical lessons on 
# dependency handling, pathing, and memory optimization for cloud Free Tiers.
set -e

echo "🦀 SimpleClaw Automated Setup"

# Check for Bun
if ! command -v bun &> /dev/null
then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
fi

# Clone and Enter
if [ ! -d "simpleclaw" ]; then
    git clone https://github.com/stancsz/simpleclaw.git
fi
cd simpleclaw

# Install
echo "📦 Installing dependencies..."
bun install

# Env Setup
if [ ! -f ".env" ]; then
    echo "📝 Creating .env from example..."
    cp .env.example .env
    echo "⚠️  REMEMBER: Edit your .env with your OPENAI_API_KEY"
fi

# Playwright for Browser Skill
echo "🌐 Installing Chromium for Browser Skill..."
npx playwright install chromium

echo "✅ Setup Complete. Run 'npx tsx cli/index.ts' to start."

FROM oven/bun:1

WORKDIR /app

# Install browser dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace config
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Ensure Playwright browsers are installed
# Use bun x since npx might not be in the path
RUN bun x playwright install chromium --with-deps

# Copy source code
COPY . .

# Set default role
ENV ROLE=worker
ENV NODE_ENV=production

# The entrypoint decides what to run. 
CMD ["sh", "-c", "if [ \"$ROLE\" = 'server' ]; then cd server && bun run dev; else bun run src/index.ts; fi"]
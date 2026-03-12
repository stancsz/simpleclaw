FROM oven/bun:1-slim

WORKDIR /app

# Copy the core workspace config files
COPY package.json bun.lock ./

# Copy the server to its directory
COPY server ./server

# Install dependencies for both the root (core) and the server
RUN bun install --frozen-lockfile --production
RUN cd server && bun install --frozen-lockfile

# Build the Next.js server
RUN cd server && bun run build

# Copy the core src directory
COPY src ./src

# Copy the worker directory
COPY worker ./worker

# Set default role
ENV ROLE=worker

# Entrypoint script checks ROLE to decide what to run
CMD ["sh", "-c", "if [ \"$ROLE\" = 'server' ]; then cd server && bun run start; else bun run --allow-read=./workspace --allow-net=api.anthropic.com,mcp-gateway.internal,localhost,management-server --permission-deny-sys worker/index.ts; fi"]
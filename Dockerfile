# Playwright's official image ships Chromium and its system dependencies, so the
# postinstall browser download becomes a no-op and the image starts fast.
# Keep this tag in step with the `playwright` version in package.json.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

ENV NODE_ENV=production

WORKDIR /app

# Copy manifests first so dependency layers cache across source-only changes.
COPY package.json package-lock.json ./

# Chromium is already present in the base image; skip the postinstall download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --ignore-scripts --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/

# The MCP server speaks JSON-RPC over stdio — no port is exposed.
ENTRYPOINT ["node", "src/index.js"]

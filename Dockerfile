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
#
# Do not wrap this in `xvfb-run`: the copy in the Playwright base image hangs
# before it ever runs the command, so the server never sees a byte of stdin
# (`echo x | docker run -i --entrypoint xvfb-run <image> -a cat` prints nothing).
# The scraping tools therefore have no display here — `launchContext()` throws on
# the first call instead of returning `not_logged_in`. That costs nothing in
# practice, since a SensorTower login is impossible in a container anyway;
# `search_app_store` and `prepare_iae` are the two tools that work in this image.
ENTRYPOINT ["node", "src/index.js"]

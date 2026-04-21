#!/usr/bin/env node

import { execSync } from "child_process";

try {
  execSync("npx playwright install chromium --with-deps", { stdio: "inherit" });
} catch (err) {
  console.warn("Warning: could not install Playwright Chromium automatically.", err.message);
  console.warn("Run `npx playwright install chromium` manually before using this tool.");
}

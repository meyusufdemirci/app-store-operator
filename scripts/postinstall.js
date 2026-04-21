#!/usr/bin/env node
import { spawnSync } from "child_process";

const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: ["ignore", process.stderr, process.stderr],
});

process.exit(result.status ?? 0);

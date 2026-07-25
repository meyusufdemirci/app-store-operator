#!/usr/bin/env node

// Copies package.json's version into the two slots server.json carries it in,
// and into the copy manifest.json carries for the MCPB bundle. Run by the
// `version` npm lifecycle script, so `npm version <bump>` keeps all of them in
// sync and folds both files into the same commit .github/workflows/publish.yml
// later checks against the tag.
//
// Every surface that reads a version from this repo must be listed here. A file
// left out drifts silently and aggregators cache the stale number — which is
// how the LobeHub listing ended up four releases behind.

import { readFileSync, writeFileSync } from "fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));

server.version = version;
server.packages[0].version = version;

writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
console.log(`server.json synced to ${version}.`);

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

manifest.version = version;

writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json synced to ${version}.`);

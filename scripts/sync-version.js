#!/usr/bin/env node

// Copies package.json's version into the two slots server.json carries it in.
// Run by the `version` npm lifecycle script, so `npm version <bump>` keeps all
// three in sync and folds server.json into the same commit .github/workflows/
// publish.yml later checks against the tag.

import { readFileSync, writeFileSync } from "fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));

server.version = version;
server.packages[0].version = version;

writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
console.log(`server.json synced to ${version}.`);

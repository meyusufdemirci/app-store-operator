#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import researchRivals from "./tools/research-rivals.js";
import searchAppStore from "./tools/search-app-store.js";
import getAppDetails from "./tools/get-app-details.js";
import prepareIae from "./tools/prepare-iae.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

const tools = [researchRivals, searchAppStore, getAppDetails, prepareIae];
const toolMap = Object.fromEntries(tools.map((t) => [t.tool.name, t]));
const SERVER_INSTRUCTIONS = `Use this server for iOS App Store competitor research and metadata work.

Choose tools this way:
- Use research_rivals for a full competitor snapshot on a keyword and country.
- Use search_app_store when you need ranked App Store results first or need more than 3 apps.
- Use get_app_details when you already have App Store app IDs and only need analytics for those apps.
- Use prepare_iae only for App Store In-App Event copy generation.

Operational notes:
- research_rivals and get_app_details require a valid SensorTower login.
- If a tool returns not_logged_in, ask the user to complete the SensorTower login in the opened browser, then retry the same tool call.
- Country inputs must be two-letter App Store country codes such as us, gb, tr, es, fr.
- Present returned data as competitive research or ASO guidance instead of raw JSON when responding to the user.`;

const server = new Server(
  { name: "app-store-operator", version: packageJson.version },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.tool),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const matched = toolMap[name];

  if (!matched) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  const result = await matched.execute(args);

  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }

  return {
    content: [{ type: "text", text: result.text }],
    ...(result.isError ? { isError: true } : {}),
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import researchRivals from "./tools/research-rivals.js";
import searchAppStore from "./tools/search-app-store.js";
import getAppDetails from "./tools/get-app-details.js";
import prepareIae from "./tools/prepare-iae.js";
import { prompts } from "./prompts.js";
import { resources, resourceTemplates, readResource } from "./resources.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

const tools = [researchRivals, searchAppStore, getAppDetails, prepareIae];
const toolMap = Object.fromEntries(tools.map((t) => [t.tool.name, t]));
const promptMap = Object.fromEntries(prompts.map((p) => [p.prompt.name, p]));
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
- Present returned data as competitive research or ASO guidance instead of raw JSON when responding to the user.

Prompts and resources:
- The prompts are multi-step workflows that already chain these tools; prefer one over improvising a sequence when the user's request matches.
- Read asops://reference/aso-fields before writing App Store metadata and asops://reference/iae-fields before writing In-App Event copy, so character limits come from the server rather than memory.
- asops://cache/research lists keyword/country pairs already researched on this machine, and asops://cache/research/{country}/{keyword} returns one of them without scraping again.`;

const server = new Server(
  { name: "app-store-operator", version: packageJson.version },
  {
    capabilities: { tools: {}, prompts: {}, resources: {} },
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

  if (typeof result?.text === "string") {
    return {
      content: [{ type: "text", text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }

  return {
    content: [{ type: "text", text: `Tool ${name} returned an unexpected result.` }],
    isError: true,
  };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: prompts.map((p) => p.prompt),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const matched = promptMap[name];

  if (!matched) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return {
    description: matched.prompt.description,
    messages: [
      { role: "user", content: { type: "text", text: matched.render(args ?? {}) } },
    ],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
  contents: [readResource(request.params.uri)],
}));

const transport = new StdioServerTransport();
await server.connect(transport);

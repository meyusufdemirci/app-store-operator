#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import researchRivals from "./tools/research-rivals.js";
import searchAppStore from "./tools/search-app-store.js";
import getAppDetails from "./tools/get-app-details.js";

const tools = [researchRivals, searchAppStore, getAppDetails];
const toolMap = Object.fromEntries(tools.map((t) => [t.tool.name, t]));

const server = new Server(
  { name: "app-store-operator", version: "0.1.0" },
  { capabilities: { tools: {} } }
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
  return { content: [{ type: "text", text: result }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

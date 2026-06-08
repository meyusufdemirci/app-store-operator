import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const client = new Client({
  name: "codex-smoke-test",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["src/index.js"],
  cwd: repoRoot,
});

function fail(message) {
  throw new Error(message);
}

try {
  await client.connect(transport);

  const instructions = client.getInstructions();
  if (!instructions?.includes("Use this server for iOS App Store competitor research")) {
    fail("initialize response is missing Codex-facing server instructions.");
  }

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  const expected = ["research_rivals", "search_app_store", "get_app_details", "prepare_iae"];

  for (const tool of expected) {
    if (!toolNames.includes(tool)) {
      fail(`Expected MCP tool "${tool}" was not exposed.`);
    }
  }

  console.log("Codex MCP smoke test passed.");
  console.log(`Tools: ${toolNames.join(", ")}`);
} finally {
  await transport.close().catch(() => {});
}

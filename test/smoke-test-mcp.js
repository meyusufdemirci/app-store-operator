import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const client = new Client({
  name: "app-store-operator-smoke-test",
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
    fail("initialize response is missing the server instructions.");
  }

  const { version } = client.getServerVersion() ?? {};
  if (version !== packageJson.version) {
    fail(`Server advertised version "${version}" but package.json says "${packageJson.version}".`);
  }

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  const expected = ["research_rivals", "search_app_store", "get_app_details", "prepare_iae"];

  for (const tool of expected) {
    if (!toolNames.includes(tool)) {
      fail(`Expected MCP tool "${tool}" was not exposed.`);
    }
  }

  console.log(`MCP smoke test passed (v${version}).`);
  console.log(`Tools: ${toolNames.join(", ")}`);
} finally {
  await transport.close().catch(() => {});
}

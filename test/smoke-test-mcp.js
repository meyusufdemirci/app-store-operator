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

  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map((prompt) => prompt.name);
  const expectedPrompts = [
    "competitor_snapshot",
    "keyword_shortlist",
    "app_teardown",
    "positioning_gap",
    "metadata_rewrite",
    "in_app_event",
  ];

  for (const prompt of expectedPrompts) {
    if (!promptNames.includes(prompt)) {
      fail(`Expected MCP prompt "${prompt}" was not exposed.`);
    }
  }

  // Render one prompt end to end — a broken render() only shows up on prompts/get.
  const rendered = await client.getPrompt({
    name: "competitor_snapshot",
    arguments: { keyword: "meditation", country: "us" },
  });
  const renderedText = rendered.messages?.[0]?.content?.text ?? "";
  if (!renderedText.includes("meditation") || !renderedText.includes("research_rivals")) {
    fail("prompts/get for competitor_snapshot did not interpolate its arguments.");
  }

  const resources = await client.listResources();
  const resourceUris = resources.resources.map((resource) => resource.uri);
  const expectedResources = [
    "asops://guide/tool-selection",
    "asops://reference/country-codes",
    "asops://reference/aso-fields",
    "asops://reference/iae-fields",
    "asops://reference/iae-locales",
    "asops://cache/research",
  ];

  for (const uri of expectedResources) {
    if (!resourceUris.includes(uri)) {
      fail(`Expected MCP resource "${uri}" was not exposed.`);
    }
  }

  const templates = await client.listResourceTemplates();
  const templateUris = templates.resourceTemplates.map((template) => template.uriTemplate);
  if (!templateUris.includes("asops://cache/research/{country}/{keyword}")) {
    fail("Expected the cached-research resource template was not exposed.");
  }

  // Read every static resource: a JSON resource that does not parse is worse than
  // a missing one, because the client will hand the garbage straight to the model.
  for (const uri of expectedResources) {
    const read = await client.readResource({ uri });
    const contents = read.contents?.[0];
    if (!contents?.text) {
      fail(`resources/read returned no text for "${uri}".`);
    }
    if (contents.mimeType === "application/json") {
      try {
        JSON.parse(contents.text);
      } catch (error) {
        fail(`Resource "${uri}" is declared as JSON but did not parse: ${error.message}`);
      }
    }
  }

  console.log(`MCP smoke test passed (v${version}).`);
  console.log(`Tools: ${toolNames.join(", ")}`);
  console.log(`Prompts: ${promptNames.join(", ")}`);
  console.log(`Resources: ${resourceUris.join(", ")}`);
} finally {
  await transport.close().catch(() => {});
}

# App Store Operator

<p align="center">
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/v/app-store-operator?color=6366f1&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/dm/app-store-operator?color=818cf8&label=downloads" alt="downloads"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen" alt="node"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-6366f1" alt="MCP"></a>
</p>

An MCP (Model Context Protocol) server that provides App Store competitive research tools for iOS app developers.

## What it does

Searches the App Store for competing apps on a given keyword and pulls detailed analytics from SensorTower — downloads, revenue, ratings, top markets, publisher info, and more.

## Tools

### `research_rivals`

Finds the top 3 apps for a keyword and returns a full metrics report for each.

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyword` | string | Search term to look up (e.g. `meditation`, `psikoloji`) |
| `country` | string | Two-letter country code (e.g. `us`, `tr`, `gb`) |

**Returns for each competitor:**
- App Store & SensorTower URLs
- Worldwide and last-month downloads & revenue
- Rating and rating count
- Publisher, categories, top markets
- Release date, last updated, supported languages
- In-app purchases and ad network presence

## Requirements

- Node.js v18+

## Usage

### As an MCP server (Claude Desktop / Claude Code)

**Claude Code** — run this command once:

```bash
claude mcp add --transport stdio app-store-operator -- npx -y app-store-operator@latest
```

**Claude Desktop** — add to your MCP config:

```json
{
  "mcpServers": {
    "app-store-operator": {
      "command": "npx",
      "args": ["app-store-operator@latest"]
    }
  }
}
```

No installation step needed — `npx` fetches and runs the package automatically.

The server communicates over stdio and is designed to be invoked by an MCP client.

## How it works

1. Queries the iTunes Search API for the top 3 apps matching the keyword and country
2. For each app, launches a headless Chromium browser to scrape SensorTower analytics
3. Extracts metrics and returns a compiled plain-text report

SensorTower data is scraped via Playwright because it is rendered client-side.

## Project structure

```
src/
├── index.js          # MCP server setup and request handlers
└── tools/
    └── research-rivals.js  # research_rivals tool implementation
```

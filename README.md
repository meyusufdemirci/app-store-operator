# App Store Operator

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
- npm

## Installation

```bash
npm install
```

Playwright will install its Chromium browser dependency automatically.

## Usage

### As an MCP server (Claude Desktop / Claude Code)

Add to your MCP config:

```json
{
  "mcpServers": {
    "app-store-operator": {
      "command": "node",
      "args": ["/path/to/app-store-operator/src/index.js"]
    }
  }
}
```

### Run directly

```bash
npm start
```

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

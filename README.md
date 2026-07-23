# App Store Operator

<p align="center">
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/v/app-store-operator?color=6366f1&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/dm/app-store-operator?color=818cf8&label=downloads" alt="downloads"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen" alt="node"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-6366f1" alt="MCP"></a>
</p>

**App Store competitive intelligence, inside Claude.**

App Store Operator is an MCP server that brings App Store research directly into your AI
assistant. Instead of switching to a dashboard, you ask Claude for ranked keyword results,
competitor download and revenue estimates, or App Store Connect-ready In-App Event copy —
and get the answer in the same conversation where you are making the decision.

Built for indie iOS developers who want research inside their workflow rather than in
another browser tab. Free and open source (MIT). A lightweight alternative to SensorTower,
AppTweak, and AppFollow for iOS-only competitive research.

```bash
claude mcp add --transport stdio app-store-operator -- npx -y app-store-operator@latest
```

→ [app-store-operator.com](https://app-store-operator.com) · [Setup guide](#usage)

## What it does

Searches the App Store for competing apps on a given keyword and pulls detailed analytics
from SensorTower — downloads, revenue, ratings, top markets, publisher info, and more.

`search_app_store` and `prepare_iae` work with no account at all. `research_rivals` and
`get_app_details` open a browser once for a **free** SensorTower sign-in, then reuse that
saved session — no paid plan, no API key.

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
- Rating score
- Publisher, categories, top markets
- Release date, last updated, supported languages
- In-app purchases and ad network presence

---

### `search_app_store`

Searches the App Store for a keyword and returns ranked results as a markdown table — instantly, no SensorTower required.

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyword` | string | Search term to look up |
| `country` | string | Two-letter country code |
| `limit` | number | Number of results to return (1–25, default 3) |

Use this to discover which apps rank before deciding which to analyse. Follow up with `get_app_details` for analytics on specific apps.

---

### `get_app_details`

Fetches SensorTower analytics for one or more app IDs you already have.

| Parameter | Type | Description |
|-----------|------|-------------|
| `app_ids` | array | Numeric App Store IDs (e.g. from `search_app_store`) |
| `country` | string | Two-letter country code |

**Returns for each app:**
- Downloads and revenue (worldwide + last month)
- Rating score
- Publisher, categories, top markets
- Release date, last updated, supported languages
- In-app purchases and ad network presence

---

### `prepare_iae`

Generates iOS App Store In-App Event (IAE) copy — 3 variations in the target language, then a final report.

| Parameter | Type | Description |
|-----------|------|-------------|
| `keywords` | array | Ordered keywords by priority (index 0–2 = Tier 1, 3–6 = Tier 2, 7–9 = Tier 3) |
| `locale` | string | Target locale (e.g. `en-us`, `en-gb`, `de-de`, `tr`, `ja`, `ko`) |
| `event_purpose` | string | What the event is about and why users should care |
| `audience` | string | Target audience (e.g. students, professionals, parents) |
| `event_context` | string | Real-world hook tying the event to a moment (e.g. a holiday, season) |
| `goal` | string | Primary conversion goal (e.g. attract new users, boost engagement) |
| `tone` | string | Copy tone: `Engaging`, `Playful`, `Motivational`, `Authoritative`, `Calm`, or `Urgent` |

**Returns:** a structured brief used to generate 3 copy variations, each with event name (≤30 chars), short description (≤50 chars), and long description (≤120 chars).

## Requirements

- Node.js v18+

## Usage

### As an MCP server (Claude Code / Claude Desktop / OpenAI Codex)

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

**OpenAI Codex** — run this command once:

```bash
codex mcp add app-store-operator -- npx -y app-store-operator@latest
```

Codex stores MCP servers in `~/.codex/config.toml`. If you prefer to edit it directly:

```toml
[mcp_servers.app-store-operator]
command = "npx"
args = ["-y", "app-store-operator@latest"]

# Optional but useful for SensorTower scraping flows
startup_timeout_sec = 20
tool_timeout_sec = 180
```

Then restart Codex or start a new thread, and ask things like:

- `Research rivals for "hairstyle" in the GB App Store`
- `Search the App Store for "beard style" in France`
- `Prepare an in-app event for a summer hairstyle campaign in en-gb`

No installation step needed — `npx` fetches and runs the package automatically.

The server communicates over stdio and is designed to be invoked by an MCP client. It advertises server-wide `instructions` during `initialize` so clients route between the tools correctly, and returns an MCP tool error when SensorTower login is required.

## How it works

1. Queries the iTunes Search API for the top 3 apps matching the keyword and country
2. For each app, drives a Chromium browser to scrape SensorTower analytics
3. Extracts metrics and returns a compiled plain-text report

SensorTower data is scraped via Playwright because it is rendered client-side.

**A browser window will open.** This is deliberate, not a bug: SensorTower requires a login, so the first run opens a visible window for you to sign in. The session is saved to `~/.app-store-operator/profile` and reused on every later call, so you only log in once. If a tool reports `not_logged_in`, finish signing in on that window and run the tool again.

Results from `research_rivals` are cached for 24 hours in `~/.app-store-operator/cache.json` — override the TTL with the `ASO_CACHE_TTL_HOURS` environment variable.

## Project structure

```
src/
├── index.js                    # MCP server setup and request handlers
├── shared.js                   # App Store lookup + SensorTower scraping
├── cache.js                    # 24h local cache (research_rivals only)
└── tools/
    ├── research-rivals.js      # research_rivals tool
    ├── search-app-store.js     # search_app_store tool
    ├── get-app-details.js      # get_app_details tool
    └── prepare-iae.js          # prepare_iae tool
scripts/postinstall.js          # installs Playwright Chromium on install
test/smoke-test-mcp.js          # stdio smoke test
```

## Development

Run the smoke test to verify the server boots and exposes every tool over stdio — it checks `initialize` (including server instructions) and `tools/list`:

```bash
npm run smoke
```

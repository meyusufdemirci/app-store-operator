# App Store Operator

<p align="center">
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/v/app-store-operator?color=6366f1&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/app-store-operator"><img src="https://img.shields.io/npm/dm/app-store-operator?color=818cf8&label=downloads" alt="downloads"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen" alt="node"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-6366f1" alt="MCP"></a>
  <a href="https://lobehub.com/mcp/meyusufdemirci-app-store-operator"><img src="https://lobehub.com/badge/mcp/meyusufdemirci-app-store-operator" alt="MCP Badge"></a>
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

## Prompts

Six ready-made workflows that already chain the tools above, so you don't have to describe the sequence yourself. In Claude Code they appear as slash commands; other clients surface them in a prompt picker.

| Prompt | Arguments | What it does |
|--------|-----------|--------------|
| `competitor_snapshot` | `keyword`, `country` | Pulls rival analytics for a keyword, then reads out who owns it and how contested it is |
| `keyword_shortlist` | `seed_keyword`, `country`, `count?` | Expands a seed keyword into candidates, tests each against live search results, and ranks them *attack / watch / skip* |
| `app_teardown` | `app_ids`, `country` | Teardown of known apps — scale, standing, monetisation, reach, momentum, acquisition |
| `positioning_gap` | `keyword`, `country`, `my_app_id` | Puts your app on the same measuring stick as the incumbents and separates *behind* from *attackable* |
| `metadata_rewrite` | `app_name`, `keyword`, `country`, `must_keep?` | Three name / subtitle / keyword-field variations, character-counted against Apple's limits |
| `in_app_event` | `event_context`, `locale`, `keywords?`, `audience?`, `tone?` | Runs the full In-App Event flow, asking for whatever `prepare_iae` still needs |

Arguments marked `?` are optional. Every prompt tells the assistant not to invent figures and, where SensorTower is involved, not to quietly fall back to a weaker tool when login is required.

## Resources

Reference data and local state a client can attach as context without spending a tool call on it.

| URI | Type | Contents |
|-----|------|----------|
| `asops://guide/tool-selection` | markdown | Which tool to use, what each costs, how the SensorTower login works |
| `asops://reference/country-codes` | markdown | Two-letter storefront codes by region |
| `asops://reference/aso-fields` | JSON | App Store Connect character limits and which fields are indexed for search |
| `asops://reference/iae-fields` | JSON | In-App Event limits, artwork sizes, copy rules, keyword tiers |
| `asops://reference/iae-locales` | JSON | Every locale `prepare_iae` accepts — generated from the same table the tool validates against |
| `asops://cache/research` | JSON | What has already been researched on this machine, and whether it is still fresh |
| `asops://cache/research/{country}/{keyword}` | JSON | One cached `research_rivals` result, without re-scraping |

Nothing here leaves your machine: the reference resources are static, and the two cache resources read `~/.app-store-operator/cache.json`.

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

## Privacy Policy

Full policy: **<https://app-store-operator.com/privacy>**

App Store Operator runs entirely on your machine. There is no backend, no telemetry, and no analytics — the author collects, receives, and stores **nothing** about you or your usage.

**What each tool sends, and where:**

| Tool | Account | What leaves your machine |
|---|---|---|
| `search_app_store` | None | Keyword and country code → Apple's public App Store search |
| `prepare_iae` | None | Nothing — pure local computation, contacts no external service |
| `research_rivals` | Free SensorTower | Keyword and country code → Apple, then SensorTower via your own browser session |
| `get_app_details` | Free SensorTower | App Store app IDs → Apple's public lookup API and SensorTower |

**What is stored locally:**

- `~/.app-store-operator/cache.json` — cached results, expiring after 24 hours by default (`ASO_CACHE_TTL_HOURS`)
- `~/.app-store-operator/profile` — the Chromium profile holding your SensorTower session

You type your SensorTower credentials into SensorTower's own page in a browser window on your machine. The server never reads or stores your password, and the author never receives it.

**Deleting everything** — no request to the author, nothing to wait for:

```bash
rm -rf ~/.app-store-operator
```

Apple and SensorTower are independent third parties with their own policies. This project is not affiliated with either.

## Project structure

```
src/
├── index.js                    # MCP server setup and request handlers
├── shared.js                   # App Store lookup + SensorTower scraping
├── cache.js                    # 24h local cache (research_rivals only)
├── prompts.js                  # the six prompt workflows
├── resources.js                # reference data + cache resources
└── tools/
    ├── research-rivals.js      # research_rivals tool
    ├── search-app-store.js     # search_app_store tool
    ├── get-app-details.js      # get_app_details tool
    └── prepare-iae.js          # prepare_iae tool
scripts/postinstall.js          # installs Playwright Chromium on install
test/smoke-test-mcp.js          # stdio smoke test
```

## Development

Run the smoke test to verify the server boots and exposes everything over stdio — it checks `initialize` (including server instructions), `tools/list`, `prompts/list`, `prompts/get`, `resources/list`, `resources/templates/list`, and reads every resource, failing if one declared as JSON does not parse:

```bash
npm run smoke
```

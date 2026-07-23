# App Store Operator — MCP Server

This project is an MCP server that provides App Store competitive intelligence tools.

Two audiences for this file: the **Codebase** section below is for working *on* this repo; the **MCP Tools** section is for clients calling the published server.

---

# Codebase

Plain ESM Node (`"type": "module"`), no build step, no linter. Node ≥ 18. The only test is a stdio smoke test (`npm run smoke`).

```
src/
├── index.js              # MCP server: registers tools, dispatches CallTool
├── shared.js             # App Store lookup + Playwright/SensorTower scraping
├── cache.js              # 24h JSON file cache (research_rivals only)
└── tools/
    ├── research-rivals.js
    ├── search-app-store.js
    ├── get-app-details.js
    └── prepare-iae.js
scripts/postinstall.js    # installs Playwright Chromium on npm install
test/smoke-test-mcp.js    # boots the server over stdio, asserts initialize + tools/list
```

`test/` is deliberately outside `package.json`'s `files` allowlist so the smoke test is not published to npm.

## Tool module contract

Every file in `src/tools/` default-exports `{ tool, execute }`:

- `tool` — the MCP tool descriptor (`name`, `description`, `inputSchema`).
- `execute(args)` — resolves to **either a string or `{ text, isError }`**. Neither shape is serialized for you, so JSON-returning tools call `JSON.stringify(..., null, 2)` themselves. A bare string becomes a successful `{ type: "text" }` result; return the object form to flag a failure (`isError: true`) while still handing the client a readable payload — that's how the two scraping tools surface `not_logged_in`. Anything else is coerced to a generic tool error.

To add a tool: create the file, then import it and append it to the `tools` array in `src/index.js:11`. Registration and dispatch are derived from that array — nothing else to touch.

The `description` field is the real prompt. Trigger phrases, output shape, and post-processing instructions for the client all live there (see `prepare-iae.js`, whose description drives the entire 3-variation workflow). Behaviour changes usually mean editing a description, not code.

## SensorTower scraping

`shared.js` drives a **non-headless** persistent Chromium context (`launchPersistentContext`, `headless: false`) rooted at `~/.app-store-operator/profile`. Non-headless is deliberate — the first run needs a visible window for the user to log in, and the session then persists in that profile.

Flow used by both scraping tools: `launchContext()` → `checkIsLoggedIn()` → on failure return `{"error": "not_logged_in"}` **without closing the context** (the open window is how the user logs in) → otherwise scrape and `context.close()` in a `finally`.

Scraping is selector-brittle by nature. `scrapeSensorTower` reads KPI cards via `div[class*="CardKpi-module__card"]`, stats via `div[class*="BaseStatistic-module__statistic"]`, ratings via `.MuiRating-root`'s `aria-label`, and falls back to regex over `document.body.innerText` for the rest. Per-app failures are swallowed and replaced with `EMPTY_ST` (all `"N/A"`), so a partial result never fails the whole call. If a field starts returning `"N/A"` across the board, SensorTower changed its markup.

`launchContext()` self-heals a missing browser by shelling out to `npx playwright install chromium`.

## Caching

`cache.js` writes `~/.app-store-operator/cache.json`, keyed `country:keyword` (both lowercased). TTL is 24h, overridable with the `ASO_CACHE_TTL_HOURS` env var. Only `research_rivals` reads/writes it — `get_app_details` always scrapes fresh.

## Data sources

- `search_app_store` and `searchAppStore()` use the `app-store-scraper` package.
- `lookupAppsByIds()` hits the iTunes Lookup API directly over `fetch` (no scraper dependency).
- Everything downloads/revenue-related comes from the SensorTower scrape.

## Release

Version appears in **three** places that must move together:

1. `package.json` → `version`
2. `server.json` → `version`
3. `server.json` → `packages[0].version`

`server.json` is the MCP registry manifest; `mcpName` in `package.json` must match its `name`. Published npm files are limited to `src` and `scripts`.

`src/index.js` reads its advertised server version from `package.json` at startup, so only the three places above need touching.

## Known gaps

- `rating.count` is always `"N/A"` — `scrapeSensorTower` declares `ratingCount` at `src/shared.js:121` and never assigns it, though the tool descriptions and README advertise a real count.
- README's "How it works" says *headless* browser; the code runs headed.

---

# MCP Tools

### `research_rivals`

All-in-one call: searches the App Store for a keyword, then fetches SensorTower analytics for the top 3 results. Results are cached for 24 hours (override with `ASO_CACHE_TTL_HOURS`).

**Always call this tool when the user says anything like:**
- "rival research" / "research rivals"
- "competitor analysis" / "competitive analysis"
- "find competing apps" / "check competitors"
- "what apps rank for [keyword]"
- "search App Store for [keyword]"
- "who are the competitors for [keyword]"
- Any request to analyze or compare competing iOS apps for a keyword

**Required inputs:** `keyword` (search term) + `country` (two-letter store code, e.g. `us`, `tr`, `gb`).

If either is missing, ask the user before calling the tool.

---

### `search_app_store`

Searches the App Store for a keyword and returns ranked results as a detailed markdown table — instantly, no browser or SensorTower required.

**Use this when:**
- You want to discover which apps rank for a keyword before deciding which to analyse
- You need more than 3 results (supports up to 25 via `limit`)
- You want fast results without triggering a SensorTower scrape

**Required inputs:** `keyword` + `country`. Optional: `limit` (1–25, default 3).

Follow up with `get_app_details` to fetch SensorTower analytics for specific app IDs from the results.

---

### `get_app_details`

Fetches SensorTower analytics for one or more app IDs you already have (e.g. from `search_app_store`). Returns downloads, revenue, ratings, publisher info, markets, and more.

**Use this when:**
- You already have app IDs and only need analytics for a subset of them
- You want to avoid re-scraping apps you don't need

**Required inputs:** `app_ids` (array of numeric App Store IDs) + `country`.

---

### `prepare_iae`

Generates iOS App Store In-App Event (IAE) copy — 3 variations in the target language, then a final report. No external API calls: the user supplies keywords and event parameters directly.

**Always call this tool when the user says anything like:**
- "prepare IAE" / "prepare in-app event"
- "create an in-app event" / "draft IAE copy"
- "generate event copy" / "write IAE metadata"

**Required inputs:** `keywords` (ordered array, up to 10) + `locale` (e.g. `en-us`, `tr`, `de-de`) + `event_purpose` + `audience` + `event_context` + `goal` + `tone`.

After the tool returns the brief, generate 3 copy variations and ask the user to pick one, then present the output table and final report.

---

## Tool Selection Guide

| Goal | Tool |
| --- | --- |
| Quick competitive overview for a keyword | `research_rivals` |
| Discover which apps rank (no analytics needed) | `search_app_store` |
| Get analytics for specific known app IDs | `get_app_details` |
| Explore rankings + pick which apps to analyse | `search_app_store` → `get_app_details` |
| Draft App Store In-App Event copy | `prepare_iae` |

## SensorTower Login

`research_rivals` and `get_app_details` both scrape SensorTower. On first use, a browser window opens for the user to log in. The session is saved to a persistent profile directory and reused automatically on every subsequent call. If a tool returns `"error": "not_logged_in"`, ask the user to log in via the opened browser and then call the tool again.

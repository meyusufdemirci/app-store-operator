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
Dockerfile                # Playwright base image; for the Glama listing + container runs
```

`test/` is deliberately outside `package.json`'s `files` allowlist so the smoke test is not published to npm.

## Tool module contract

Every file in `src/tools/` default-exports `{ tool, execute }`:

- `tool` — the MCP tool descriptor (`name`, `title`, `description`, `inputSchema`, `annotations`). All four tools are read-only, so every one carries `readOnlyHint: true`; `openWorldHint` is `true` for the three that reach the App Store or SensorTower and `false` for `prepare_iae`. `title` is deliberately set twice — once at the top level (current spec) and once inside `annotations` (the back-compat slot older clients and directory crawlers still read). Both are required by the Claude plugin/MCPB review and feed Glama's Tool Definition Quality score, so new tools must carry them too.
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

Cutting a release is two steps — write the notes, then tag:

```
# 1. rename CHANGELOG.md's "## Unreleased" heading to the version you're about to cut
npm version patch    # or minor / major / an explicit 0.3.2
git push github development --follow-tags
```

`npm version` bumps `package.json`, then the `version` lifecycle script runs `scripts/sync-version.js`, which copies that version into the **two** slots `server.json` carries it in (`version` and `packages[0].version`) and `git add`s the file so it lands in the same commit. The commit and the tag are created for you; `.npmrc` sets `tag-version-prefix=` so the tag is a bare `0.3.2`, not `v0.3.2`. Never edit the three version fields by hand — the sync script is the only writer.

`server.json` is the MCP registry manifest; `mcpName` in `package.json` must match its `name`. Published npm files are limited to `src` and `scripts`, minus `scripts/sync-version.js` (release-time only).

`src/index.js` reads its advertised server version from `package.json` at startup, so nothing else tracks the version.

Publishing is then automated by `.github/workflows/publish.yml`, triggered by the tag. The workflow refuses to continue unless all three match the tag (and `mcpName` matches `server.json`'s `name`), runs the smoke test, publishes to npm, registers `server.json` with the MCP registry, and finally creates the GitHub release.

Release notes are **not** generated from commit subjects — they're the `CHANGELOG.md` section whose heading exactly matches the tag (`## 0.3.3`), copied verbatim into the release body. That file is written for users of the tools, not for whoever touched the CI. If the section is missing the workflow logs a warning and falls back to `--generate-notes`, which dumps raw commit subjects into a public release — treat that fallback as a bug, not a workflow. Adding a release therefore means renaming `## Unreleased` before running `npm version`; unlike the version fields, this one is hand-written on purpose. Both publishes authenticate over GitHub OIDC and **no repository secrets are required**: npm uses trusted publishing (registered on npmjs.com against this repo + the `publish.yml` filename — renaming the workflow breaks it), and the MCP registry proves the `io.github.meyusufdemirci/*` namespace from the token's repo claim. Re-running a failed job is safe: an already-published npm version is skipped.

## Known gaps

- `rating.count` is now wired up — `scrapeSensorTower` reads it from the Ratings and Reviews panel text after clicking the tab, because the count is not in `.MuiRating-root`'s `aria-label` (only the score is) and the `text` capture further up predates the click. **The patterns are unverified against live SensorTower**: they were written against the shapes the panel is expected to use (`1,234 Ratings`, `Total Ratings 12.3K`, `Ratings: 987`) and unit-tested against those, but nobody has yet confirmed them on a logged-in run. Run `ASO_DEBUG_RATINGS=1` and call `research_rivals` — if either field comes back `"N/A"` the panel text is dumped to stderr, which is enough to correct the patterns in one pass. Until a real run confirms it, treat the populated `"count"` in the `research_rivals` and `get_app_details` example JSON as aspirational.
- `rating.score` may be broken too, independently of the above: every entry in a `~/.app-store-operator/cache.json` from May 2026 has `{"score": "N/A", "count": "N/A"}`, which points at either selector drift on `.MuiRating-root` or the tab click timing out. The same `ASO_DEBUG_RATINGS=1` run answers this.

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

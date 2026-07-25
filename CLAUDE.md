# App Store Operator — MCP Server

This project is an MCP server that provides App Store competitive intelligence tools.

Two audiences for this file: the **Codebase** section below is for working *on* this repo; the **MCP Tools** section is for clients calling the published server.

---

# Codebase

Plain ESM Node (`"type": "module"`), no build step, no linter, no transpiler. Node ≥ 18. The only test is a stdio smoke test (`npm run smoke`).

Three runtime dependencies, and each one is load-bearing:

- `@modelcontextprotocol/sdk` — the **low-level** `Server` class plus raw request schemas, not the `McpServer` helper. Handlers are registered by schema in `src/index.js`.
- `playwright` — drives the SensorTower scrape. Installed browsers are the reason `postinstall` exists.
- `app-store-scraper` — App Store keyword search.

```
src/
├── index.js              # MCP server: registers tools/prompts/resources, dispatches requests
├── shared.js             # App Store lookup + Playwright/SensorTower scraping
├── cache.js              # 24h JSON file cache (research_rivals only)
├── prompts.js            # six prompt workflows (prompts/list, prompts/get)
├── resources.js          # asops:// reference data + cache resources
└── tools/
    ├── research-rivals.js
    ├── search-app-store.js
    ├── get-app-details.js
    └── prepare-iae.js
scripts/postinstall.js    # installs Playwright Chromium on npm install
scripts/sync-version.js   # release-time version fan-out; never published to npm
test/smoke-test-mcp.js    # boots the server over stdio and exercises every surface
package.json              # npm package + the single source of truth for the version
server.json               # MCP registry manifest (carries the version twice)
manifest.json             # MCPB/Claude Desktop bundle manifest (carries the version once)
icon.png                  # bundle icon, referenced by manifest.json
glama.json                # claims maintainership of the Glama listing
Dockerfile                # Playwright base image; for the Glama listing + container runs
CHANGELOG.md              # hand-written release notes; the workflow reads these verbatim
.npmrc                    # tag-version-prefix= — tags are bare, not v-prefixed
.github/workflows/publish.yml
```

`test/` is deliberately outside `package.json`'s `files` allowlist so the smoke test is not published to npm. `scripts/sync-version.js` is excluded the same way, via a negated entry.

## Server wiring

`src/index.js` derives everything from three arrays — `tools`, `prompts`, `resources` — so adding a surface is an append, never a new handler.

It also owns `SERVER_INSTRUCTIONS`, the server-wide `instructions` string returned during `initialize`. That is the only routing guidance a client gets before it has read any tool description, so it carries the tool-selection rules, the `not_logged_in` retry rule, and pointers to the prompts and resources. **The smoke test asserts its opening line** (`"Use this server for iOS App Store competitor research"`) — rewrite the paragraph freely, but keep that phrase or update the test with it.

The advertised server version is read from `package.json` at startup, so nothing in `src/` tracks a version number.

## Tool module contract

Every file in `src/tools/` default-exports `{ tool, execute }`:

- `tool` — the MCP tool descriptor (`name`, `title`, `description`, `inputSchema`, `annotations`). All four tools are read-only, so every one carries `readOnlyHint: true`; `openWorldHint` is `true` for the three that reach the App Store or SensorTower and `false` for `prepare_iae`. `title` is deliberately set twice — once at the top level (current spec) and once inside `annotations` (the back-compat slot older clients and directory crawlers still read). Both are required by the Claude plugin/MCPB review and feed Glama's Tool Definition Quality score, so new tools must carry them too.
- `execute(args)` — resolves to **either a string or `{ text, isError }`**. Neither shape is serialized for you, so JSON-returning tools call `JSON.stringify(..., null, 2)` themselves. A bare string becomes a successful `{ type: "text" }` result; return the object form to flag a failure (`isError: true`) while still handing the client a readable payload — that's how the two scraping tools surface `not_logged_in`. Anything else is coerced to a generic tool error.

Nothing validates `args` at runtime beyond the client's own schema enforcement — `inputSchema` is the whole guard, which is why the schemas carry `pattern`, `enum`, `minLength`, and `minItems` rather than leaving inputs open.

To add a tool: create the file, then import it and append it to the `tools` array in `src/index.js:26`. Registration and dispatch are derived from that array — nothing else to touch. Add its name to `expected` in the smoke test, and to `manifest.json`'s hand-written `tools` list.

The `description` field is the real prompt. Trigger phrases, cost disclosure, output shape, and post-processing instructions for the client all live there (see `prepare-iae.js`, whose description drives the entire 3-variation workflow). Behaviour changes usually mean editing a description, not code.

## Prompts

`src/prompts.js` exports `prompts`, an array of `{ prompt, render }`. `prompt` is the MCP descriptor (`name`, `title`, `description`, `arguments`); `render(args)` returns the **user message text** — `index.js` wraps it into `messages` for `prompts/get`.

Prompt arguments are always strings; the protocol has no other type. `render()` is therefore the only place that normalises them, and it must tolerate every argument being absent — a client may call `prompts/get` with no arguments at all to preview a prompt. The `trim`/`splitList` helpers at the top of the file exist for that, and each render substitutes a visible `<placeholder>` rather than emitting `undefined`.

Two shared clauses, `LOGIN_NOTE` and `NO_INVENTION`, are appended to the prompts they apply to. They are the counterweight to this server's two failure modes: an assistant quietly falling back to `search_app_store` when SensorTower wants a login (returning a weaker answer than was asked for), and an assistant filling `"N/A"` fields with plausible numbers. Keep them on any new prompt that touches a scraping tool.

To add a prompt: append it to the `prompts` array — `index.js` derives registration and dispatch from that array. Add its name to `expectedPrompts` in the smoke test.

## Resources

`src/resources.js` exports `resources` (static descriptors), `resourceTemplates`, and `readResource(uri)`. Everything is under the `asops://` scheme.

`readResource` **throws** on an unknown, malformed, or missing URI rather than returning empty contents — an empty read looks like real data to a model, an error does not. The internal `STATIC_RESOURCES` array carries a `read()` per entry, stripped off before export so the descriptor list never leaks a function.

Two resources are generated rather than written out, so they cannot drift from the code they describe: `iae-locales` comes from `prepare-iae.js`'s exported `LOCALE_MAP`, and the two cache resources read `~/.app-store-operator/cache.json` on every request. `asops://cache/research` lists expired entries too — knowing a keyword was researched is useful even when the data is stale — while the `asops://cache/research/{country}/{keyword}` template goes through `getCached()` and so returns an error once the TTL is up.

To add a resource: append to `STATIC_RESOURCES` and add its URI to `expectedResources` in the smoke test, which reads every one and fails if something declared `application/json` does not parse.

## SensorTower scraping

`shared.js` drives a **non-headless** persistent Chromium context (`launchPersistentContext`, `headless: false`) rooted at `~/.app-store-operator/profile`. Non-headless is deliberate — the first run needs a visible window for the user to log in, and the session then persists in that profile. It also means the two scraping tools need a real desktop session: no display, no scrape.

Flow used by both scraping tools: `launchContext()` → `checkIsLoggedIn()` → on failure return `{"error": "not_logged_in"}` **without closing the context** (the open window is how the user logs in) → otherwise scrape and `context.close()` in a `finally`.

`research_rivals` opens one page per app and scrapes all three concurrently; `get_app_details` reuses a single page and walks the IDs in sequence, which is why its cost scales linearly with the number of IDs.

Scraping is selector-brittle by nature. `scrapeSensorTower` reads KPI cards via `div[class*="CardKpi-module__card"]` (taking the value from `span.MuiTypography-h1`, not the card's subtitle text), stats via `div[class*="BaseStatistic-module__statistic"]`, ratings via `.MuiRating-root`'s `aria-label`, and falls back to regex over `document.body.innerText` for the rest. Per-app failures are swallowed and replaced with `EMPTY_ST` (all `"N/A"`), so a partial result never fails the whole call. If a field starts returning `"N/A"` across the board, SensorTower changed its markup.

`launchContext()` self-heals a missing browser by shelling out to `npx playwright install chromium`.

## Caching

`cache.js` writes `~/.app-store-operator/cache.json`, keyed `country:keyword` (both lowercased). TTL is 24h, overridable with the `ASO_CACHE_TTL_HOURS` env var. Only `research_rivals` reads/writes it — `get_app_details` always scrapes fresh.

There is no invalidation beyond the TTL and no schema version on the file, so a cache written by an older scraper is still served for up to 24h after an upgrade, and is listed by `asops://cache/research` indefinitely.

## Data sources

- `search_app_store` and `searchAppStore()` use the `app-store-scraper` package.
- `lookupAppsByIds()` hits the iTunes Lookup API directly over `fetch` (no scraper dependency).
- Everything downloads/revenue-related comes from the SensorTower scrape.

## Environment variables

| Variable | Read by | Effect |
| --- | --- | --- |
| `ASO_CACHE_TTL_HOURS` | `cache.js` | Cache lifetime in hours, default 24. Also declared in `manifest.json`'s `user_config` and `server.json`'s `environmentVariables` — changing its meaning means editing those too. |
| `ASO_DEBUG_RATINGS` | `shared.js` | When set, dumps the Ratings and Reviews panel text to **stderr** if the score or count comes back empty. stdout is the JSON-RPC channel — never log there. |

## Smoke test

`npm run smoke` boots `src/index.js` over stdio with the real SDK client and asserts, in order: the `initialize` response carries the server instructions; the advertised version matches `package.json`; all four tools are listed; all six prompts are listed; `prompts/get` for `competitor_snapshot` actually interpolates its arguments (a broken `render()` shows up nowhere else); all six static resources and the cache template are listed; and every static resource reads back non-empty, with anything declared `application/json` parsing.

It makes no network calls and opens no browser, which is why CI can run it after `npm ci --ignore-scripts`.

## Packaging surfaces

The same server is described in four places, for four different consumers. They drift silently, so know which is which:

| File | Consumer | Notes |
| --- | --- | --- |
| `package.json` | npm | Source of truth for the version. `mcpName` must equal `server.json`'s `name`. |
| `server.json` | MCP registry | Carries the version **twice** (`version`, `packages[0].version`). |
| `manifest.json` | MCPB bundle / Claude Desktop | Carries the version once, plus its own hand-written `tools` list and `user_config`. Adding or renaming a tool means editing that list by hand — nothing generates it. |
| `Dockerfile` | Glama listing, container runs | Base image tag must be bumped by hand alongside the `playwright` dependency (currently both 1.59.1). |

`app-store-operator.mcpb` is a build artifact and is gitignored (`*.mcpb`). Packing it zips the whole working tree — source, docs, `icon.png`, and `node_modules` (≈37 MB unpacked) — and embeds the current `manifest.json`, so re-pack it *after* a version bump, never before.

The container is a reduced build on purpose: with no display, `launchContext()` throws on the first call instead of returning `not_logged_in`, so only `search_app_store` and `prepare_iae` work there. The Dockerfile's comment explains why `xvfb-run` is not the fix — the copy in the Playwright base image swallows stdin, and a SensorTower login is impossible in a container anyway.

## Release

Cutting a release is two steps — write the notes, then tag:

```
# 1. rename CHANGELOG.md's "## Unreleased" heading to the version you're about to cut
npm version patch    # or minor / major / an explicit 0.3.2
git push github development --follow-tags
```

`npm version` bumps `package.json`, then the `version` lifecycle script runs `scripts/sync-version.js`, which copies that version into the **three** downstream slots — `server.json`'s `version` and `packages[0].version`, and `manifest.json`'s `version` — and the lifecycle script then `git add`s both files so they land in the same commit. The commit and the tag are created for you; `.npmrc` sets `tag-version-prefix=` so the tag is a bare `0.3.2`, not `v0.3.2`. Never edit those four version fields by hand — `package.json` is the input and the sync script is the only other writer. Any new file carrying a version has to be added to `sync-version.js`; one left out drifts silently, which is how the LobeHub listing ended up four releases behind.

Publishing is then automated by `.github/workflows/publish.yml`, triggered by the tag. The workflow refuses to continue unless `package.json`'s version and both of `server.json`'s match the tag (and `mcpName` matches `server.json`'s `name`), runs the smoke test, publishes to npm, registers `server.json` with the MCP registry, and finally creates the GitHub release. **`manifest.json`'s version is synced but never verified** — the MCPB bundle is not part of the tagged pipeline, so a drifted manifest fails nothing and ships wrong.

Release notes are **not** generated from commit subjects — they're the `CHANGELOG.md` section whose heading exactly matches the tag (`## 0.3.3`), copied verbatim into the release body. That file is written for users of the tools, not for whoever touched the CI. If the section is missing the workflow logs a warning and falls back to `--generate-notes`, which dumps raw commit subjects into a public release — treat that fallback as a bug, not a workflow. Adding a release therefore means renaming `## Unreleased` before running `npm version`; unlike the version fields, this one is hand-written on purpose.

Both publishes authenticate over GitHub OIDC and **no repository secrets are required**: npm uses trusted publishing (registered on npmjs.com against this repo + the `publish.yml` filename — renaming the workflow breaks it), and the MCP registry proves the `io.github.meyusufdemirci/*` namespace from the token's repo claim. Re-running a failed job is safe: an already-published npm version is skipped, and so is an existing GitHub release.

Published npm files are limited to `src` and `scripts`, minus `scripts/sync-version.js` (release-time only).

## Known gaps

**The scrape has not been confirmed against a live logged-in SensorTower session since the 2026-05-10 selector rework.** Everything below follows from that.

- The on-disk cache is not evidence about the current scraper, in either direction. Every entry in `~/.app-store-operator/cache.json` was written on 2026-04-21 — before the rework — which is why they all carry `"downloads": "by Sensor Tower"` (the KPI card's subtitle, captured instead of the value; the `span.MuiTypography-h1` selector that fixes this landed afterwards) and `{"score": "N/A", "count": "N/A"}` for ratings (the Ratings and Reviews tab click did not exist yet). Those entries are long past the 24h TTL so nothing serves them — they surface only in the `asops://cache/research` index — but do not read them as a report on today's code.
- `rating.count` is wired up: `scrapeSensorTower` reads it from the Ratings and Reviews panel text after clicking the tab, because the count is not in `.MuiRating-root`'s `aria-label` (only the score is) and the `text` capture further up predates the click. **The patterns are unverified against live SensorTower** — they were written against the shapes the panel is expected to use (`1,234 Ratings`, `Total Ratings 12.3K`, `Ratings: 987`) and never confirmed on a real run.
- `rating.score` may fail independently of that, through selector drift on `.MuiRating-root` or the tab click timing out.
- One `ASO_DEBUG_RATINGS=1` run of `research_rivals` settles all three: if either field comes back `"N/A"` the panel text is dumped to stderr, which is enough to correct the patterns in one pass. Until then, treat the populated `downloads`, `revenue`, and `"count"` values in the `research_rivals` and `get_app_details` example JSON as aspirational.
- `manifest.json`'s version is unchecked by CI (see Release), and its `tools` list is maintained by hand.

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

**Required inputs:** `app_ids` (array of numeric App Store IDs, passed as strings) + `country`. Nothing here is cached, and each ID adds roughly 10–20 seconds.

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

---

## Prompts

Six workflows that chain the tools above. Prefer one of these over improvising a tool sequence when the user's request matches.

| Prompt | Arguments | Use when |
| --- | --- | --- |
| `competitor_snapshot` | `keyword`, `country` | "How competitive is this keyword?" — analytics plus a read on who owns it |
| `keyword_shortlist` | `seed_keyword`, `country`, `count?` | "Which keywords should I target?" — expand a seed, test each, rank them |
| `app_teardown` | `app_ids`, `country` | "What is this app doing?" — deep read on apps whose IDs you already have |
| `positioning_gap` | `keyword`, `country`, `my_app_id` | "Where do I stand?" — your app against the incumbents on one keyword |
| `metadata_rewrite` | `app_name`, `keyword`, `country`, `must_keep?` | "Rewrite my listing" — name, subtitle, and keyword field with character counts |
| `in_app_event` | `event_context`, `locale`, `keywords?`, `audience?`, `tone?` | "Prepare an IAE" — collects what `prepare_iae` needs, then runs the flow |

## Resources

| URI | Contents |
| --- | --- |
| `asops://guide/tool-selection` | Which tool to use, what each costs, how the login works |
| `asops://reference/country-codes` | Two-letter storefront codes by region |
| `asops://reference/aso-fields` | App Store Connect limits and which fields are indexed |
| `asops://reference/iae-fields` | In-App Event limits, artwork sizes, copy rules |
| `asops://reference/iae-locales` | Locales `prepare_iae` accepts |
| `asops://cache/research` | What is already cached on this machine |
| `asops://cache/research/{country}/{keyword}` | One cached result, no re-scrape |

Read `aso-fields` before writing App Store metadata and `iae-fields` before writing event copy — take the character limits from the server rather than from memory. Check `asops://cache/research` before a `research_rivals` call if you want to know whether it will hit the cache.

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

Both tools need a real desktop session for that window. On a headless machine or inside a container they fail outright rather than returning `not_logged_in` — use `search_app_store` there.

Fields SensorTower does not expose, or gates behind a paywall, come back as `"N/A"`. Report those as missing data; never substitute an estimate.

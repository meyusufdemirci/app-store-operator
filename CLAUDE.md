# App Store Operator — MCP Server

This project is an MCP server that provides App Store competitive intelligence tools.

## MCP Tools

### `research_rivals`

All-in-one call: searches the App Store for a keyword, then fetches SensorTower analytics for the top 3 results. Results are cached for 24 hours.

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

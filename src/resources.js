// MCP resources — reference data and local state a client can attach as context
// without spending a tool call on it.
//
// Every URI lives under the `asops://` scheme. Static references are computed at
// module load; `asops://cache/research` and the cache template read the local
// cache file on each request, so they always reflect what is on disk now.

import { LOCALE_MAP } from "./tools/prepare-iae.js";
import { getCached, listCached, TTL_HOURS } from "./cache.js";

const JSON_MIME = "application/json";
const MD_MIME = "text/markdown";

const stringify = (value) => JSON.stringify(value, null, 2);

// ---------------------------------------------------------------- references

const COUNTRY_CODES = {
  "North America": { us: "United States", ca: "Canada", mx: "Mexico" },
  "Western Europe": {
    gb: "United Kingdom", ie: "Ireland", de: "Germany", fr: "France", es: "Spain",
    it: "Italy", nl: "Netherlands", be: "Belgium", at: "Austria", ch: "Switzerland",
    pt: "Portugal",
  },
  "Nordics": { se: "Sweden", no: "Norway", dk: "Denmark", fi: "Finland" },
  "Central & Eastern Europe": {
    pl: "Poland", cz: "Czechia", hu: "Hungary", ro: "Romania", gr: "Greece",
    ua: "Ukraine", ru: "Russia",
  },
  "Middle East & Africa": {
    tr: "Türkiye", il: "Israel", sa: "Saudi Arabia", ae: "United Arab Emirates",
    eg: "Egypt", za: "South Africa", ng: "Nigeria",
  },
  "Asia Pacific": {
    jp: "Japan", kr: "South Korea", cn: "China", tw: "Taiwan", hk: "Hong Kong",
    sg: "Singapore", my: "Malaysia", th: "Thailand", vn: "Vietnam",
    ph: "Philippines", id: "Indonesia", in: "India", au: "Australia", nz: "New Zealand",
  },
  "Latin America": {
    br: "Brazil", ar: "Argentina", cl: "Chile", co: "Colombia", pe: "Peru",
  },
};

const countryCodesMarkdown = () => {
  const sections = Object.entries(COUNTRY_CODES).map(([region, codes]) => {
    const rows = Object.entries(codes)
      .map(([code, name]) => `| \`${code}\` | ${name} |`)
      .join("\n");
    return `### ${region}\n\n| Code | Store |\n| --- | --- |\n${rows}`;
  });

  return `# App Store country codes

Every tool in this server takes \`country\` as a lowercase two-letter code. It selects
the **storefront**, not the language: \`country: "tr"\` returns what a user browsing the
Turkish App Store sees, whatever language their device is set to.

Rankings, availability, pricing, and SensorTower's download and revenue estimates are
all per-storefront — the same keyword in \`us\` and \`gb\` is a different competitive set.

${sections.join("\n\n")}

Apple operates roughly 175 storefronts; the list above is the subset worth researching
for most apps. Any valid ISO 3166-1 alpha-2 code Apple runs a store in will work.`;
};

const ASO_FIELDS = {
  note: "App Store Connect metadata limits. Character counts are hard caps — App Store Connect rejects anything longer.",
  fields: {
    app_name: { limit: 30, indexed: true, note: "Indexed for search. Highest keyword weight of any field." },
    subtitle: { limit: 30, indexed: true, note: "Indexed. Second-highest weight. Do not repeat words already in the name." },
    keyword_field: {
      limit: 100,
      indexed: true,
      note: "Comma-separated, not visible to users. No spaces after commas — a space costs a character.",
      rules: [
        "Never repeat a word that already appears in the app name or subtitle — it is already indexed.",
        "Skip plurals and articles; Apple handles stemming and ignores stop words.",
        "Do not repeat your own category name — you are already indexed for it.",
        "Competitor brand names are against App Store Review Guideline 5.2.1.",
      ],
    },
    promotional_text: { limit: 170, indexed: false, note: "Not indexed. Updatable without a new build — use it for time-sensitive messaging." },
    description: { limit: 4000, indexed: false, note: "Not indexed for search on the App Store. Write it for conversion, not keywords." },
    whats_new: { limit: 4000, indexed: false, note: "Release notes. Not indexed." },
  },
  localisation: {
    note: "Each localisation carries its own name, subtitle, and keyword field, and each is indexed separately.",
    tip: "In a multi-language storefront, adding a second localisation adds a whole new keyword field rather than diluting the first.",
  },
  ranking_signals: [
    "Keyword presence and position in name and subtitle",
    "Download velocity, not lifetime totals",
    "Rating score weighted by rating count",
    "Retention and engagement after install",
    "Conversion rate from impression to install",
  ],
};

const IAE_FIELDS = {
  note: "iOS In-App Event fields, as validated by App Store Connect. `prepare_iae` enforces these limits.",
  copy_fields: {
    event_name: { limit: 30, note: "Shown on the event card. Include the primary keyword only if it fits naturally." },
    short_description: { limit: 50, note: "Shown under the name in search and browse. Must carry a Tier 1 keyword." },
    long_description: { limit: 120, note: "Shown on the event detail page. Must carry a Tier 1 keyword." },
  },
  artwork: {
    event_card: { size: "2160 × 1080 px", note: "The image used across search, browse, and the product page." },
    app_icon_overlay: { size: "1024 × 1024 px" },
  },
  defaults: {
    priority: "HIGH",
    purchase_requirement: "NO_COST_ASSOCIATED",
    purpose_badge: "ATTRACT_NEW_USERS",
  },
  copy_rules: [
    "Active voice, present tense.",
    "No pricing claims and no percentage discounts — App Store Review rejects these in event copy.",
    "No competitor names.",
    "All three fields must be independently meaningful; they are not always shown together.",
    "Prioritise keywords toward the beginning of each field.",
  ],
  keyword_tiers: {
    tier_1: "Keywords 1–3. Must appear in the short and long description.",
    tier_2: "Keywords 4–7. Include where natural.",
    tier_3: "Keywords 8–10. Only if space allows.",
  },
};

const TOOL_SELECTION_GUIDE = `# Choosing a tool

| Goal | Tool | Cost |
| --- | --- | --- |
| Quick competitive overview for a keyword | \`research_rivals\` | SensorTower login; 30–60s on a cache miss, instant on a hit |
| Discover which apps rank, no analytics needed | \`search_app_store\` | None — about a second, no browser |
| Analytics for app IDs you already have | \`get_app_details\` | SensorTower login; 10–20s per app, never cached |
| Rankings first, then analytics on a subset | \`search_app_store\` → \`get_app_details\` | As above, but you only scrape what you need |
| App Store In-App Event copy | \`prepare_iae\` | None — fully local, no network call |

## Scope

iOS App Store only. None of these tools cover Google Play or Android, and none of them
write anything — no App Store Connect changes, no SensorTower changes.

## SensorTower login

\`research_rivals\` and \`get_app_details\` scrape SensorTower through a real Chromium
window running on the user's own machine. The first call opens that window for the user
to log in; the session persists in \`~/.app-store-operator/profile\` and is reused after
that.

If a call returns \`{"error": "not_logged_in"}\`, the window is open and waiting. Tell the
user to log in there, then call the same tool again. Do not silently fall back to
\`search_app_store\` — it carries no downloads or revenue data, so the answer would be
quietly weaker than the one that was asked for.

## Missing data

Fields SensorTower does not expose, or gates behind a paywall, come back as \`"N/A"\`.
A single app failing to scrape is not fatal — that app returns with \`"N/A"\` fields
rather than failing the whole call. Report \`"N/A"\` as missing data; never fill the gap
with an estimate.

## Caching

Only \`research_rivals\` caches, keyed on \`country:keyword\`, for ${TTL_HOURS} hours
(\`ASO_CACHE_TTL_HOURS\` overrides it). \`get_app_details\` always scrapes fresh. What is
currently cached is listed at \`asops://cache/research\`.`;

// ------------------------------------------------------------------ registry

const STATIC_RESOURCES = [
  {
    uri: "asops://guide/tool-selection",
    name: "tool_selection_guide",
    title: "Tool Selection Guide",
    description: "Which tool to reach for, what each one costs, how the SensorTower login works, and how to treat missing data.",
    mimeType: MD_MIME,
    read: () => TOOL_SELECTION_GUIDE,
  },
  {
    uri: "asops://reference/country-codes",
    name: "country_codes",
    title: "App Store Country Codes",
    description: "Two-letter storefront codes accepted by every tool's `country` argument, grouped by region.",
    mimeType: MD_MIME,
    read: () => countryCodesMarkdown(),
  },
  {
    uri: "asops://reference/aso-fields",
    name: "aso_fields",
    title: "App Store Metadata Limits",
    description: "Character limits and indexing behaviour for app name, subtitle, keyword field, promotional text, and description.",
    mimeType: JSON_MIME,
    read: () => stringify(ASO_FIELDS),
  },
  {
    uri: "asops://reference/iae-fields",
    name: "iae_fields",
    title: "In-App Event Field Limits",
    description: "Character limits, artwork sizes, copy rules, and keyword tiers for iOS In-App Events.",
    mimeType: JSON_MIME,
    read: () => stringify(IAE_FIELDS),
  },
  {
    uri: "asops://reference/iae-locales",
    name: "iae_locales",
    title: "Supported In-App Event Locales",
    description: "Every locale `prepare_iae` accepts, with its Apple locale code, language, country, and keyword storefront.",
    mimeType: JSON_MIME,
    read: () =>
      stringify({
        note: "Values accepted by prepare_iae's `locale` argument. Anything else returns an unknown_locale error.",
        locales: Object.entries(LOCALE_MAP).map(([value, info]) => ({ value, ...info })),
      }),
  },
  {
    uri: "asops://cache/research",
    name: "research_cache_index",
    title: "Cached Research Index",
    description: "Keyword/country pairs already researched on this machine, with their age and whether they are still fresh.",
    mimeType: JSON_MIME,
    read: () => {
      const entries = listCached();
      return stringify({
        ttlHours: TTL_HOURS,
        cacheFile: "~/.app-store-operator/cache.json",
        note: entries.length
          ? "Read a single entry at asops://cache/research/{country}/{keyword}. Expired entries are listed but will be re-scraped on the next research_rivals call."
          : "Nothing cached yet. Only research_rivals writes to this cache.",
        count: entries.length,
        entries,
      });
    },
  },
];

const CACHE_ENTRY_TEMPLATE = {
  uriTemplate: "asops://cache/research/{country}/{keyword}",
  name: "research_cache_entry",
  title: "Cached Research Entry",
  description: "The full cached `research_rivals` payload for one country/keyword pair, without re-scraping. Expired or missing entries return an error.",
  mimeType: JSON_MIME,
};

const CACHE_ENTRY_PREFIX = "asops://cache/research/";

export const resources = STATIC_RESOURCES.map(({ read, ...descriptor }) => descriptor);
export const resourceTemplates = [CACHE_ENTRY_TEMPLATE];

// Returns `{ uri, mimeType, text }`, or throws so the client sees a JSON-RPC error
// rather than an empty result it might mistake for real data.
export function readResource(uri) {
  const staticMatch = STATIC_RESOURCES.find((resource) => resource.uri === uri);
  if (staticMatch) {
    return { uri, mimeType: staticMatch.mimeType, text: staticMatch.read() };
  }

  if (uri.startsWith(CACHE_ENTRY_PREFIX)) {
    const segments = uri.slice(CACHE_ENTRY_PREFIX.length).split("/");
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
      throw new Error(`Malformed cache URI: ${uri}. Expected ${CACHE_ENTRY_TEMPLATE.uriTemplate}`);
    }

    const [country, keyword] = segments.map(decodeURIComponent);
    const cached = getCached(keyword, country);
    if (!cached) {
      throw new Error(
        `No fresh cache entry for keyword "${keyword}" in "${country}". Call research_rivals to populate it, or see asops://cache/research for what is cached.`
      );
    }

    return { uri, mimeType: JSON_MIME, text: stringify({ ...cached, cached: true }) };
  }

  throw new Error(`Unknown resource: ${uri}`);
}

export default { resources, resourceTemplates, readResource };

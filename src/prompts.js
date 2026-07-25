// MCP prompts — user-invoked workflows that chain this server's tools.
//
// Each entry is `{ prompt, render }`:
//   prompt — the MCP prompt descriptor (name, title, description, arguments)
//   render(args) — returns the user message text for prompts/get
//
// Prompt arguments are always strings (the protocol has no other type), so
// render() is the only place that normalises or defaults them.

const trim = (value, fallback = "") => (typeof value === "string" && value.trim() ? value.trim() : fallback);

const splitList = (value) =>
  trim(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const LOGIN_NOTE = `If a SensorTower tool returns \`{"error": "not_logged_in"}\`, stop and tell me to finish the login in the browser window it opened, then call the same tool again. Do not substitute a different tool to work around it.`;

const NO_INVENTION = `Never invent numbers. Any field the tool returned as "N/A" stays "N/A" in your write-up, and say plainly which parts of the picture are missing because of it.`;

const competitorSnapshot = {
  prompt: {
    name: "competitor_snapshot",
    title: "Competitor Snapshot",
    description:
      "Full competitive read on one App Store keyword: pulls rival downloads, revenue, and ratings, then summarises who owns the keyword and how contested it is.",
    arguments: [
      { name: "keyword", description: "App Store search term to analyse (e.g. meditation, expense tracker)", required: true },
      { name: "country", description: "Two-letter App Store country code (e.g. us, gb, tr)", required: true },
    ],
  },
  render: ({ keyword, country }) => {
    const kw = trim(keyword, "<keyword>");
    const cc = trim(country, "us").toLowerCase();

    return `Run a competitive snapshot for the App Store keyword "${kw}" in the ${cc.toUpperCase()} store.

1. Call \`research_rivals\` with keyword="${kw}" and country="${cc}".
2. Present every returned app in rank order, using the report block the tool's own description specifies.
3. Then add a **Read** section — at most six bullets — covering:
   - who owns the top of this keyword, and how big the gap is between #1 and #3 on downloads and revenue
   - whether the leaders are entrenched old apps or recent entrants (use release date and last updated)
   - the monetisation pattern across the set (free vs paid, subscription price points from in-app purchases)
   - how concentrated the top markets are — is this keyword global or one-country
4. Close with one sentence: is this keyword contested or open for a new entrant, and why.

${LOGIN_NOTE}

${NO_INVENTION}`;
  },
};

const keywordShortlist = {
  prompt: {
    name: "keyword_shortlist",
    title: "Keyword Shortlist",
    description:
      "Expands one seed keyword into a ranked shortlist of App Store search terms worth targeting, each checked against live search results.",
    arguments: [
      { name: "seed_keyword", description: "Starting keyword or app concept to expand from", required: true },
      { name: "country", description: "Two-letter App Store country code (e.g. us, gb, tr)", required: true },
      { name: "count", description: "How many candidate keywords to test (default 6, keep it under 10 — each one is a separate search)", required: false },
    ],
  },
  render: ({ seed_keyword, country, count }) => {
    const seed = trim(seed_keyword, "<seed keyword>");
    const cc = trim(country, "us").toLowerCase();
    const parsed = Number.parseInt(trim(count, "6"), 10);
    const n = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 2), 10) : 6;

    return `Build a keyword shortlist for the ${cc.toUpperCase()} App Store, starting from "${seed}".

1. Derive ${n} candidate search terms from "${seed}". Mix in:
   - the head term itself
   - two or three long-tail variants (2–3 words) a real user would type
   - at least one problem-phrased term ("how to ..." style intent, compressed to store-search length)
   - at least one competitor-category term, if one exists for this concept
   Write the list out before you search, so I can see the reasoning.
2. Call \`search_app_store\` once per candidate with country="${cc}" and limit=10. This tool is fast and needs no login — do not use \`research_rivals\` here.
3. For each candidate, record from the returned results:
   - how many of the top 10 actually match the intent versus incidental matches
   - the rating and review counts of the top 3 (high review counts = entrenched incumbents)
   - whether the top results are big-brand apps or small independents
4. Rank the candidates into a table: \`| Keyword | Intent match | Top-3 review weight | Verdict |\` where the verdict is one of *attack*, *watch*, *skip*, with a half-line reason.
5. Recommend the two or three keywords worth a full \`research_rivals\` run and say what you expect that to confirm.

${NO_INVENTION}`;
  },
};

const appTeardown = {
  prompt: {
    name: "app_teardown",
    title: "Rival App Teardown",
    description:
      "Deep teardown of one or more known App Store apps: analytics, monetisation, market spread, and what their numbers imply about strategy.",
    arguments: [
      { name: "app_ids", description: "Numeric App Store app IDs, comma-separated (the digits after `id` in an apps.apple.com URL)", required: true },
      { name: "country", description: "Two-letter App Store country code (e.g. us, gb, tr)", required: true },
    ],
  },
  render: ({ app_ids, country }) => {
    const ids = splitList(app_ids);
    const cc = trim(country, "us").toLowerCase();
    const idList = ids.length ? ids.join(", ") : "<app ids>";

    return `Tear down ${ids.length > 1 ? "these App Store apps" : "this App Store app"} in the ${cc.toUpperCase()} store: ${idList}.

1. Call \`get_app_details\` with app_ids=${JSON.stringify(ids.length ? ids : ["<app id>"])} and country="${cc}".
2. For each app, write a teardown with these headings:
   - **Scale** — downloads and revenue, plus revenue per download if both are real numbers
   - **Standing** — rating score against rating count; a 4.8 on 200 ratings is not a 4.8 on 200,000
   - **Money** — the in-app purchase shape (one-off, subscription, tiers) and what price point it implies
   - **Reach** — top markets and languages; where the app is actually earning versus where it is merely listed
   - **Momentum** — release date against last updated; is this actively shipped or coasting
   - **Acquisition** — whether it advertises on any network
3. If more than one app was requested, finish with a comparison table and one paragraph on how they differ strategically, not just numerically.

${LOGIN_NOTE}

${NO_INVENTION}`;
  },
};

const positioningGap = {
  prompt: {
    name: "positioning_gap",
    title: "Positioning Gap Analysis",
    description:
      "Compares your app against the rivals ranking for a keyword and identifies where you are behind, level, or able to attack.",
    arguments: [
      { name: "keyword", description: "The keyword you want to compete on", required: true },
      { name: "country", description: "Two-letter App Store country code (e.g. us, gb, tr)", required: true },
      { name: "my_app_id", description: "Your own numeric App Store app ID", required: true },
    ],
  },
  render: ({ keyword, country, my_app_id }) => {
    const kw = trim(keyword, "<keyword>");
    const cc = trim(country, "us").toLowerCase();
    const mine = trim(my_app_id, "<my app id>");

    return `Work out where my app stands against the rivals for "${kw}" in the ${cc.toUpperCase()} store.

1. Call \`research_rivals\` with keyword="${kw}" and country="${cc}" to get the incumbents.
2. Call \`get_app_details\` with app_ids=["${mine}"] and country="${cc}" to get mine on the same measuring stick.
3. Build one table putting my app in the same rows as the rivals: downloads, revenue, rating score, rating count, price model, top markets, last updated.
4. Then split the findings into three short sections:
   - **Behind** — where a rival is measurably ahead and the gap is structural (install base, review count, market coverage)
   - **Level** — where the numbers are close enough that positioning and metadata decide the winner
   - **Attackable** — specific weaknesses: stale last-updated dates, thin language coverage, a single-market footprint, a weak rating on a large count
5. Recommend at most three moves, each tied to a specific rival weakness from the Attackable list. Say what you would expect each move to change and roughly how long that takes to show up.

If my app does not appear in the \`research_rivals\` results at all, say so explicitly — that is the finding, and it means ranking work comes before positioning work.

${LOGIN_NOTE}

${NO_INVENTION}`;
  },
};

const metadataRewrite = {
  prompt: {
    name: "metadata_rewrite",
    title: "App Store Metadata Rewrite",
    description:
      "Rewrites App Store name, subtitle, and keyword field against live rival listings, with hard character counts on every field.",
    arguments: [
      { name: "app_name", description: "Your current App Store app name", required: true },
      { name: "keyword", description: "The primary keyword you want the listing to rank for", required: true },
      { name: "country", description: "Two-letter App Store country code (e.g. us, gb, tr)", required: true },
      { name: "must_keep", description: "Words or brand terms the new copy must keep, comma-separated (optional)", required: false },
    ],
  },
  render: ({ app_name, keyword, country, must_keep }) => {
    const app = trim(app_name, "<app name>");
    const kw = trim(keyword, "<keyword>");
    const cc = trim(country, "us").toLowerCase();
    const keep = splitList(must_keep);

    return `Rewrite the App Store listing metadata for "${app}", targeting "${kw}" in the ${cc.toUpperCase()} store.

1. Call \`search_app_store\` with keyword="${kw}", country="${cc}", limit=10 and read how the ranking apps title and subtitle themselves. Note which words recur — those are the terms the store associates with this keyword.
2. Read the resource \`asops://reference/aso-fields\` for the exact field limits before writing anything.
3. Produce **three** complete variations. Each one is:
   - **App name** — 30 characters hard limit
   - **Subtitle** — 30 characters hard limit
   - **Keyword field** — 100 characters hard limit, comma-separated, no spaces after commas, no word repeated from the name or subtitle, no plurals of words already present
   Print every field with its exact character count and a ✓ or ✗. Fix every ✗ before showing me anything.
4. Under each variation, add one line on what it optimises for — head-term ranking, long-tail coverage, or brand clarity.
${keep.length ? `5. These must survive into the name or subtitle of every variation: ${keep.join(", ")}.\n6.` : "5."} Ask me to pick one, then give the final copy block plus a short note on what to watch after the change ships.

Rules for the copy: no competitor names, no pricing or discount claims, no "best" or "#1" superlatives, no keyword stuffing that reads badly out loud.

${NO_INVENTION}`;
  },
};

const inAppEvent = {
  prompt: {
    name: "in_app_event",
    title: "In-App Event Copy",
    description:
      "Runs the full In-App Event workflow: builds the brief, generates three copy variations inside Apple's character limits, and produces the final report.",
    arguments: [
      { name: "event_context", description: "The real-world hook — a holiday, season, launch, or milestone the event ties to", required: true },
      { name: "locale", description: "Target locale for the copy (e.g. en-us, de-de, tr, ja)", required: true },
      { name: "keywords", description: "Keywords in priority order, comma-separated, up to 10 (optional — I will ask if omitted)", required: false },
      { name: "audience", description: "Who the event is for (e.g. students, new users, lapsed subscribers)", required: false },
      { name: "tone", description: "One of: Engaging, Playful, Motivational, Authoritative, Calm, Urgent", required: false },
    ],
  },
  render: ({ event_context, locale, keywords, audience, tone }) => {
    const context = trim(event_context, "<event context>");
    const loc = trim(locale, "en-us").toLowerCase();
    const kws = splitList(keywords);
    const who = trim(audience);
    const voice = trim(tone);

    const known = [
      `- event_context: ${context}`,
      `- locale: ${loc}`,
      kws.length ? `- keywords (priority order): ${kws.join(", ")}` : null,
      who ? `- audience: ${who}` : null,
      voice ? `- tone: ${voice}` : null,
    ].filter(Boolean).join("\n");

    const missing = [
      kws.length ? null : "keywords",
      who ? null : "audience",
      voice ? null : "tone",
      "event_purpose",
      "goal",
    ].filter(Boolean);

    return `Prepare an App Store In-App Event around: ${context}

What I have given you:
${known}

Still needed before the tool call: ${missing.join(", ")}. Ask me for those in one message — do not guess them, and do not invent keywords. If you need candidate keywords, offer to run \`search_app_store\` first and wait for my answer.

Then call \`prepare_iae\` with the full set and follow its output instructions exactly: three variations in ${loc}, every field with its character count and ✓ / ✗, then the output table and the final report once I pick one.

Check \`asops://reference/iae-fields\` if you need the field limits or artwork sizes, and \`asops://reference/iae-locales\` if you are unsure whether ${loc} is supported.`;
  },
};

export const prompts = [
  competitorSnapshot,
  keywordShortlist,
  appTeardown,
  positioningGap,
  metadataRewrite,
  inAppEvent,
];

export default prompts;

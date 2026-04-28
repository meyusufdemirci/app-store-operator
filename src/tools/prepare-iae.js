const LOCALE_MAP = {
  "en-us":   { appleCode: "en-US",   language: "English",              country: "United States", store: "US" },
  "en-gb":   { appleCode: "en-GB",   language: "English",              country: "United Kingdom", store: "GB" },
  "de":      { appleCode: "de-DE",   language: "German",               country: "Germany",        store: "DE" },
  "de-de":   { appleCode: "de-DE",   language: "German",               country: "Germany",        store: "DE" },
  "fr":      { appleCode: "fr-FR",   language: "French",               country: "France",         store: "FR" },
  "fr-fr":   { appleCode: "fr-FR",   language: "French",               country: "France",         store: "FR" },
  "es":      { appleCode: "es-ES",   language: "Spanish",              country: "Spain",          store: "ES" },
  "es-es":   { appleCode: "es-ES",   language: "Spanish",              country: "Spain",          store: "ES" },
  "es-mx":   { appleCode: "es-MX",   language: "Spanish",              country: "Mexico",         store: "MX" },
  "it":      { appleCode: "it-IT",   language: "Italian",              country: "Italy",          store: "IT" },
  "it-it":   { appleCode: "it-IT",   language: "Italian",              country: "Italy",          store: "IT" },
  "ja":      { appleCode: "ja-JA",   language: "Japanese",             country: "Japan",          store: "JP" },
  "ja-ja":   { appleCode: "ja-JA",   language: "Japanese",             country: "Japan",          store: "JP" },
  "ko":      { appleCode: "ko-KR",   language: "Korean",               country: "South Korea",    store: "KR" },
  "ko-kr":   { appleCode: "ko-KR",   language: "Korean",               country: "South Korea",    store: "KR" },
  "pt-br":   { appleCode: "pt-BR",   language: "Portuguese",           country: "Brazil",         store: "BR" },
  "nl":      { appleCode: "nl-NL",   language: "Dutch",                country: "Netherlands",    store: "NL" },
  "nl-nl":   { appleCode: "nl-NL",   language: "Dutch",                country: "Netherlands",    store: "NL" },
  "zh-hans": { appleCode: "zh-Hans", language: "Chinese Simplified",   country: "China",          store: "CN" },
  "zh-hant": { appleCode: "zh-Hant", language: "Chinese Traditional",  country: "Taiwan",         store: "TW" },
  "tr":      { appleCode: "tr-TR",   language: "Turkish",              country: "Türkiye",        store: "TR" },
  "tr-tr":   { appleCode: "tr-TR",   language: "Turkish",              country: "Türkiye",        store: "TR" },
};

const DESCRIPTION = `Prepare an iOS App Store In-App Event (IAE) — generate copy variations and a final report.

Use this when the user wants to create or draft an in-app event, prepare IAE metadata, or generate App Store event copy.
Accepts user-supplied keywords and event parameters, then returns a structured brief.

**After receiving the tool output, you MUST:**
1. Generate **3 distinct copy variations** in the target language (from \`locale.language\`), each differing meaningfully in angle, tone, or keyword emphasis. For each variation produce:
   - **Event name** (hard limit: 30 chars — count every character; trim at word boundary if over)
   - **Short description** (hard limit: 50 chars — same rules)
   - **Long description** (hard limit: 120 chars — same rules)
   Display every field with its exact character count and ✓ / ✗ indicator. Fix any ✗ before showing the user.
   Keyword placement: Tier 1 keywords must appear in short description and long description; embed in event name only if it fits naturally. Prioritize keywords toward the beginning of each field.
   Copy rules: active voice, present tense, no pricing claims or % discounts, no competitor names, all three fields independently meaningful.
   If locale is not en-US, add an English translation line under each localized field so the user can verify meaning.

2. Ask the user to choose one variation.

3. After the user picks a variation, print the **output table** and the **final summary report** using this exact format:

**Output table:**
\`\`\`
CHOSEN VARIATION — <locale.appleCode>
─────────────────────────────────────
Event name        : <text> (<N>/30)
Short description : <text> (<N>/50)
Long description  : <text> (<N>/120)
─────────────────────────────────────
Next step: upload event artwork in App Store Connect
  • Event card image : 2160 × 1080 px
  • App icon overlay : 1024 × 1024 px
\`\`\`

**Final summary report:**
\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IN-APP EVENT REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IAE locale       : <locale.appleCode> (<locale.language> — <locale.country>)
Keyword store    : <locale.store> store
Target audience  : <audience>
Event context    : <event_context>
Goal             : <goal>
Tone             : <tone>
─────────────────────────────────────
Keywords used    : <Tier 1 placed> | <Tier 2 placed>
Event name       : <text> (<N>/30 chars)
Short description: <text> (<N>/50 chars)
Long description : <text> (<N>/120 chars)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKLIST
[ ] IAE locale is <locale.appleCode>
[ ] Event name ≤ 30 chars
[ ] Short description ≤ 50 chars
[ ] Long description ≤ 120 chars
[ ] No pricing claims or % discounts
[ ] No competitor names
[ ] Event artwork assets prepared (1024×1024 + 2160×1080)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`
Flag any checklist item that is not yet satisfied.

Returns JSON with the structured brief for generating copy.`;

function assignTiers(keywords) {
  return keywords.map((kw, i) => {
    let tier;
    if (i < 3) tier = 1;
    else if (i < 7) tier = 2;
    else tier = 3;
    return { keyword: kw, tier, isLongTail: kw.trim().includes(" ") };
  });
}

export async function execute({ keywords, locale, event_purpose, audience, event_context, goal, tone }) {
  const localeKey = (locale || "en-us").toLowerCase();
  const localeInfo = LOCALE_MAP[localeKey];

  if (!localeInfo) {
    return JSON.stringify({
      error: "unknown_locale",
      message: `Locale "${locale}" is not recognized. Supported values: ${Object.keys(LOCALE_MAP).join(", ")}`,
    });
  }

  const tieredKeywords = assignTiers(keywords || []);
  const tier1 = tieredKeywords.filter((k) => k.tier === 1);
  const tier2 = tieredKeywords.filter((k) => k.tier === 2);
  const tier3 = tieredKeywords.filter((k) => k.tier === 3);

  const keywordDisplay = [
    "KEYWORD TIERS",
    "─────────────────────────────────────",
    "Tier 1 — must include in short & long description:",
    ...tier1.map((k, i) => `  ${i + 1}. ${k.keyword}${k.isLongTail ? " [long-tail]" : ""}`),
    "Tier 2 — include if natural:",
    ...tier2.map((k, i) => `  ${i + 4}. ${k.keyword}${k.isLongTail ? " [long-tail]" : ""}`),
    "Tier 3 — use only if space allows:",
    ...tier3.map((k, i) => `  ${i + 8}. ${k.keyword}${k.isLongTail ? " [long-tail]" : ""}`),
    "─────────────────────────────────────",
  ].join("\n");

  return JSON.stringify({
    locale: localeInfo,
    event_purpose,
    audience,
    event_context,
    goal,
    tone,
    keywords: tieredKeywords,
    keywordDisplay,
    charLimits: { event_name: 30, short_description: 50, long_description: 120 },
    defaults: { priority: "HIGH", purchase_requirement: "NO_COST_ASSOCIATED", purpose_badge: "ATTRACT_NEW_USERS" },
  }, null, 2);
}

export default {
  tool: {
    name: "prepare_iae",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of keywords by priority (index 0–2 = Tier 1 must-use, 3–6 = Tier 2, 7–9 = Tier 3). Maximum 10.",
        },
        locale: {
          type: "string",
          description: "Target locale/language for the IAE copy (e.g. en-us, en-gb, de-de, fr-fr, tr, ja, ko, zh-hans).",
        },
        event_purpose: {
          type: "string",
          description: "1–2 sentences describing what the event is about and why users should care.",
        },
        audience: {
          type: "string",
          description: "Target audience (e.g. students, professionals, parents, casual users).",
        },
        event_context: {
          type: "string",
          description: "Real-world hook tying the event to a moment (e.g. a holiday, season, product milestone).",
        },
        goal: {
          type: "string",
          description: "Primary conversion goal (e.g. increase conversions, attract new users, boost engagement).",
        },
        tone: {
          type: "string",
          enum: ["Engaging", "Playful", "Motivational", "Authoritative", "Calm", "Urgent"],
          description: "Copy tone.",
        },
      },
      required: ["keywords", "locale", "event_purpose", "audience", "event_context", "goal", "tone"],
    },
  },
  execute,
};

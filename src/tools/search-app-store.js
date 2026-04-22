import store from "app-store-scraper";

const DESCRIPTION = `Search the App Store for a keyword and return ranked results as a detailed table — instantly, no browser required.

Use this when you want to discover which apps rank for a keyword before deciding which ones to analyse in depth.
- Follow up with \`get_app_details\` to fetch SensorTower analytics for specific app IDs.
- Use \`research_rivals\` instead for a single convenience call that searches and fetches analytics together.

Returns a markdown table with all available App Store fields for each result.`;

function formatApps(apps) {
  const escape = (s) => String(s).replace(/\|/g, "\\|");

  return apps.map((app, i) => {
    const fields = [
      ["ID",                  app.id ?? "N/A"],
      ["Bundle ID",           app.appId ?? "N/A"],
      ["Developer",           app.developer ?? "N/A"],
      ["Developer ID",        app.developerId ?? "N/A"],
      ["Developer URL",       app.developerUrl ?? "N/A"],
      ["Developer Website",   app.developerWebsite ?? "N/A"],
      ["Price",               app.price != null ? `${app.price} ${app.currency}` : "N/A"],
      ["Free",                app.free ? "Yes" : "No"],
      ["Rating",              app.score != null ? app.score.toFixed(1) : "N/A"],
      ["Reviews",             app.reviews ?? "N/A"],
      ["Version Rating",      app.currentVersionScore != null ? app.currentVersionScore.toFixed(1) : "N/A"],
      ["Version Reviews",     app.currentVersionReviews ?? "N/A"],
      ["Primary Genre",       app.primaryGenre ?? "N/A"],
      ["Genres",              Array.isArray(app.genres) ? app.genres.join(", ") : "N/A"],
      ["Content Rating",      app.contentRating ?? "N/A"],
      ["Version",             app.version ?? "N/A"],
      ["Released",            app.released ? app.released.slice(0, 10) : "N/A"],
      ["Updated",             app.updated ? app.updated.slice(0, 10) : "N/A"],
      ["Size",                app.size ? `${(parseInt(app.size) / 1e6).toFixed(1)} MB` : "N/A"],
      ["Min OS",              app.requiredOsVersion ?? "N/A"],
      ["Languages",           Array.isArray(app.languages) ? app.languages.join(", ") : "N/A"],
      ["App Store URL",       app.url ? app.url.split("?")[0] : "N/A"],
      ["Sensor Tower URL",    `https://app.sensortower.com/overview/${app.id}`],
    ];

    const header = `### #${i + 1} — ${app.title ?? "Unknown"}\n`;
    const tableHeader = `| Field | Value |\n| --- | --- |`;
    const rows = fields.map(([k, v]) => `| ${escape(k)} | ${escape(v)} |`).join("\n");
    return `${header}${tableHeader}\n${rows}`;
  }).join("\n\n");
}

export async function search(keyword, country, limit = 3) {
  const results = await store.search({ term: keyword, country, num: Math.min(limit, 25) });
  return results.slice(0, Math.min(limit, 25));
}

export async function execute({ keyword, country, limit = 3 }) {
  const apps = await search(keyword, country, limit);
  const header = `**App Store Search:** "${keyword}" · ${country.toUpperCase()} · ${new Date().toISOString()}\n\n`;
  return header + formatApps(apps);
}

export default {
  tool: {
    name: "search_app_store",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "The keyword to search in the App Store (e.g. meditation, psikoloji)",
        },
        country: {
          type: "string",
          description: "Two-letter App Store country code (e.g. us, gb, tr)",
        },
        limit: {
          type: "number",
          description: "Number of results to return (1–25, default 3)",
        },
      },
      required: ["keyword", "country"],
    },
  },
  execute,
};


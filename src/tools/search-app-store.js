import store from "app-store-scraper";

const DESCRIPTION = `Search the App Store for a keyword and return ranked results as a detailed table — instantly, no browser required.

Use this when you want to discover which apps rank for a keyword before deciding which ones to analyse in depth.
- Follow up with \`get_app_details\` to fetch SensorTower analytics for specific app IDs.
- Use \`research_rivals\` instead for a single convenience call that searches and fetches analytics together.

Returns a markdown table with all available App Store fields for each result.`;

function formatTable(apps) {
  const rows = apps.map((app, i) => [
    String(i + 1),
    app.title ?? "N/A",
    String(app.id ?? "N/A"),
    app.appId ?? "N/A",
    app.developer ?? "N/A",
    app.developerWebsite ?? "N/A",
    app.price != null ? `${app.price} ${app.currency}` : "N/A",
    app.free ? "Yes" : "No",
    app.score != null ? String(app.score.toFixed(1)) : "N/A",
    app.reviews != null ? String(app.reviews) : "N/A",
    app.currentVersionScore != null ? String(app.currentVersionScore.toFixed(1)) : "N/A",
    app.currentVersionReviews != null ? String(app.currentVersionReviews) : "N/A",
    app.primaryGenre ?? "N/A",
    app.contentRating ?? "N/A",
    app.version ?? "N/A",
    app.released ? app.released.slice(0, 10) : "N/A",
    app.updated ? app.updated.slice(0, 10) : "N/A",
    app.size ? `${(parseInt(app.size) / 1e6).toFixed(1)} MB` : "N/A",
    app.requiredOsVersion ?? "N/A",
    Array.isArray(app.languages) ? app.languages.join(", ") : "N/A",
    app.url ? app.url.split("?")[0] : "N/A",
    `https://app.sensortower.com/overview/${app.id}`,
  ]);

  const headers = [
    "Rank", "Name", "ID", "Bundle ID", "Developer", "Dev Website",
    "Price", "Free", "Rating", "Reviews", "Version Rating", "Version Reviews",
    "Primary Genre", "Content Rating", "Version", "Released", "Updated",
    "Size", "Min OS", "Languages", "App Store URL", "Sensor Tower URL",
  ];

  const escape = (s) => s.replace(/\|/g, "\\|");
  const header = `| ${headers.map(escape).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(escape).join(" | ")} |`).join("\n");

  return `${header}\n${separator}\n${body}`;
}

export async function search(keyword, country, limit = 3) {
  const results = await store.search({ term: keyword, country, num: Math.min(limit, 25) });
  return results.slice(0, Math.min(limit, 25));
}

export async function execute({ keyword, country, limit = 3 }) {
  const apps = await search(keyword, country, limit);
  const header = `**App Store Search:** "${keyword}" · ${country.toUpperCase()} · ${new Date().toISOString()}\n\n`;
  return header + formatTable(apps);
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


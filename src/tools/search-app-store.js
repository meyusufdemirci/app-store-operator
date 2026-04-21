import { searchAppStore } from "../shared.js";

const DESCRIPTION = `Search the App Store for a keyword and return ranked app IDs, names, and URLs — instantly, no browser required.

Use this when you want to discover which apps rank for a keyword before deciding which ones to analyse in depth.
- Follow up with \`get_app_details\` to fetch SensorTower analytics for specific app IDs.
- Use \`research_rivals\` instead for a single convenience call that searches and fetches analytics together.

Returns JSON:
\`\`\`json
{
  "keyword": "meditation",
  "country": "us",
  "fetchedAt": "2026-04-21T10:00:00.000Z",
  "apps": [
    { "rank": 1, "name": "App Name", "id": "123456", "appStoreUrl": "...", "sensorTowerUrl": "..." }
  ]
}
\`\`\``;

export async function execute({ keyword, country, limit = 3 }) {
  const apps = await searchAppStore(keyword, country, Math.min(limit, 25));
  const result = {
    keyword,
    country,
    fetchedAt: new Date().toISOString(),
    apps: apps.map((app, i) => ({ rank: i + 1, name: app.name, id: app.id, appStoreUrl: app.storeUrl, sensorTowerUrl: app.sensorTowerUrl })),
  };
  return JSON.stringify(result, null, 2);
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

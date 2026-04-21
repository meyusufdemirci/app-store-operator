import { lookupAppsByIds, scrapeSensorTower, launchContext, buildAppProfile, EMPTY_ST } from "../shared.js";

const DESCRIPTION = `Fetch SensorTower analytics for one or more App Store app IDs. Returns downloads, revenue, ratings, publisher info, markets, and more for each app.

Use this when you already have app IDs (e.g. from \`search_app_store\`) and want detailed analytics for only a subset of them — avoiding unnecessary scrapes for apps you don't need.
Use \`research_rivals\` instead for a single convenience call that searches and fetches analytics together.

Returns JSON:
\`\`\`json
{
  "country": "us",
  "fetchedAt": "2026-04-21T10:00:00.000Z",
  "apps": [
    {
      "rank": 1,
      "name": "App Name",
      "appStoreUrl": "...",
      "sensorTowerUrl": "...",
      "downloads": "<5K",
      "revenue": "<$5K",
      "rating": { "score": "4.7", "count": "1,234" },
      "publisher": "Publisher Name",
      "categories": "Health & Fitness",
      "topMarkets": "United States, United Kingdom",
      "releaseDate": "Jan 1, 2020",
      "lastUpdated": "Mar 15, 2026",
      "languages": "English, Spanish",
      "inAppPurchases": "Monthly · $9.99",
      "publisherCountry": "United States",
      "advertisingNetworks": "N/A"
    }
  ]
}
\`\`\`

Fields missing or gated behind a paywall will be \`"N/A"\`.`;

export async function execute({ app_ids, country }) {
  const entries = await lookupAppsByIds(app_ids, country);
  const context = await launchContext();

  try {
    const page = await context.newPage();
    const apps = [];

    for (let i = 0; i < entries.length; i++) {
      let st;
      try {
        st = await scrapeSensorTower(page, entries[i].id, country);
      } catch {
        st = EMPTY_ST;
      }
      apps.push(buildAppProfile(i + 1, entries[i], st));
    }

    return JSON.stringify({ country, fetchedAt: new Date().toISOString(), apps }, null, 2);
  } finally {
    await context.close();
  }
}

export default {
  tool: {
    name: "get_app_details",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        app_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of numeric App Store app IDs (e.g. [\"123456\", \"789012\"])",
        },
        country: {
          type: "string",
          description: "Two-letter App Store country code (e.g. us, gb, tr)",
        },
      },
      required: ["app_ids", "country"],
    },
  },
  execute,
};

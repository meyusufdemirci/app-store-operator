import { searchAppStore, scrapeSensorTower, launchContext, buildAppProfile, EMPTY_ST } from "../shared.js";
import { getCached, setCached } from "../cache.js";

const DESCRIPTION = `Search the App Store for a keyword and fetch SensorTower analytics for the top results — all in one call. Results are cached for 24 hours so repeat queries are instant.

Use this for a quick competitive overview when you want everything in one step.
Use \`search_app_store\` + \`get_app_details\` separately when you need more than 3 results, a custom limit, or selective fetching of specific apps.

Trigger phrases: "rival research", "research rivals", "competitor analysis", "find competing apps", "check competitors", "what apps compete with", "App Store competitors", "rivals for keyword".

Returns JSON:
\`\`\`json
{
  "keyword": "meditation",
  "country": "us",
  "fetchedAt": "2026-04-21T10:00:00.000Z",
  "cached": false,
  "apps": [
    {
      "rank": 1,
      "name": "App Name",
      "appStoreUrl": "https://apps.apple.com/us/app/id123456",
      "sensorTowerUrl": "https://app.sensortower.com/overview/123456",
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

Fields missing or gated behind a paywall will be \`"N/A"\`. When \`cached\` is \`true\`, the data was served from the local cache and no scraping occurred.

Present results as a clean report for each app:

---

**#1 — {name}**
- App Store: {appStoreUrl}
- SensorTower: {sensorTowerUrl}
- Downloads: {downloads}
- Revenue: {revenue}
- Rating: {rating.score} ({rating.count} ratings)
- Publisher: {publisher}
- Categories: {categories}
- Top Markets: {topMarkets}
- Worldwide Release Date: {releaseDate}
- Last Updated: {lastUpdated}
- Languages: {languages}
- In-App Purchases: {inAppPurchases}
- Publisher Country: {publisherCountry}
- Advertised on Any Network: {advertisingNetworks}`;

export async function execute({ keyword, country }) {
  const cached = getCached(keyword, country);
  if (cached) {
    return JSON.stringify({ ...cached, cached: true }, null, 2);
  }

  const apps = await searchAppStore(keyword, country, 3);

  // Persistent context so the SensorTower session survives across runs.
  // headless: false lets the user log in on first use; the session is then
  // saved to PROFILE_DIR and reused automatically on every subsequent call.
  const context = await launchContext();

  try {
    const pages = await Promise.all(apps.map(() => context.newPage()));

    const rows = await Promise.all(
      apps.map(async (app, i) => {
        let st;
        try {
          st = await scrapeSensorTower(pages[i], app.id, country);
        } catch {
          st = EMPTY_ST;
        }
        return buildAppProfile(i + 1, app, st);
      })
    );

    const result = { keyword, country, fetchedAt: new Date().toISOString(), cached: false, apps: rows };
    setCached(keyword, country, result);
    return JSON.stringify(result, null, 2);
  } finally {
    await context.close();
  }
}

export default {
  tool: {
    name: "research_rivals",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "The keyword to search in the App Store (e.g. psikoloji, meditation)",
        },
        country: {
          type: "string",
          description: "Two-letter App Store country code (e.g. us, gb, tr)",
        },
      },
      required: ["keyword", "country"],
    },
  },
  execute,
};

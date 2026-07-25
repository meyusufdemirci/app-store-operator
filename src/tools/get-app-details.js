import { lookupAppsByIds, scrapeSensorTower, launchContext, buildAppProfile, EMPTY_ST, checkIsLoggedIn } from "../shared.js";

const DESCRIPTION = `Fetch SensorTower analytics for one or more App Store app IDs. Returns downloads, revenue, ratings, publisher info, markets, and more for each app.

Use this when you already have app IDs (e.g. from \`search_app_store\`) and want detailed analytics for only a subset of them — avoiding unnecessary scrapes for apps you don't need.
Use \`research_rivals\` instead for a single convenience call that searches and fetches analytics together.
Do not use this for Google Play or Android apps — it takes numeric iOS App Store IDs only.

Requires a SensorTower account. The server opens a real Chromium window on the user's machine; the first run needs the user to log in there, and the session is reused from then on. If there is no session the call returns an error result carrying \`{"error": "not_logged_in"}\` and leaves the window open — tell the user to log in, then call again. Results are never cached, so every call scrapes fresh and costs roughly 10–20 seconds per app ID.

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

Fields missing or gated behind a paywall will be \`"N/A"\`. A single app failing to scrape is not fatal — that app comes back with \`"N/A"\` fields rather than failing the whole call.`;

export async function execute({ app_ids, country }) {
  const entries = await lookupAppsByIds(app_ids, country);
  const context = await launchContext();

  const checkPage = await context.newPage();
  const isLoggedIn = await checkIsLoggedIn(checkPage);

  if (!isLoggedIn) {
    // Keep browser open so the user can log in — do NOT close context
    return {
      isError: true,
      text: JSON.stringify({
        error: "not_logged_in",
        message: "SensorTower requires login. A browser window has been opened and navigated to SensorTower. Please log in and then call get_app_details again to continue.",
      }),
    };
  }

  await checkPage.close();

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
    title: "Get App Analytics",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        app_ids: {
          type: "array",
          items: { type: "string", pattern: "^[0-9]+$" },
          minItems: 1,
          description: "List of numeric App Store app IDs, as strings (e.g. [\"123456\", \"789012\"]). Each is the digits from an apps.apple.com URL's `id` segment, without the `id` prefix.",
        },
        country: {
          type: "string",
          pattern: "^[A-Za-z]{2}$",
          description: "Two-letter App Store country code (e.g. us, gb, tr)",
        },
      },
      required: ["app_ids", "country"],
    },
    annotations: {
      title: "Get App Analytics",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  execute,
};

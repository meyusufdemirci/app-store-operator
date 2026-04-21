import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const PROFILE_DIR = join(homedir(), ".app-store-operator", "profile");

const DESCRIPTION = `Use this tool when the user wants to research rival or competitor apps in the App Store. Trigger phrases include: "rival research", "research rivals", "competitor analysis", "find competing apps", "check competitors", "competitive analysis", "what apps compete with", "App Store competitors", "rivals for keyword", or any variation of researching competing iOS apps.

This tool searches the App Store for a given keyword in a specific country store and returns the top 3 apps with structured JSON data including SensorTower analytics.

## Step 1 — Gather inputs

The following inputs are **required**. Check if each was provided with the command. For any that are missing, ask the user before proceeding:

- **Keyword**: the search term to look up (e.g. \`psikoloji\`, \`meditation\`)
- **Store**: the two-letter country code for the target store (e.g. \`tr\`, \`us\`, \`gb\`)

Only proceed to Step 2 once both inputs are confirmed.

## Step 2 — Execute

Call this tool with the keyword and country. It returns a JSON object:

\`\`\`json
{
  "keyword": "meditation",
  "country": "us",
  "fetchedAt": "2026-04-21T10:00:00.000Z",
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

Fields missing or gated behind a paywall will be \`"N/A"\`.

## Step 3 — Render

Present the results as a clean report using the JSON fields. For each app:

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

async function searchAppStore(keyword, country) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${country}&entity=software&limit=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`App Store search failed: ${res.status}`);
  const data = await res.json();

  return data.results.slice(0, 3).map((app) => ({
    name: app.trackName,
    id: String(app.trackId),
    storeUrl: `https://apps.apple.com/${country}/app/id${app.trackId}`,
    sensorTowerUrl: `https://app.sensortower.com/overview/${app.trackId}`,
  }));
}

async function scrapeSensorTower(page, appId, country) {
  await page.goto(
    `https://app.sensortower.com/overview/${appId}?country=${country.toUpperCase()}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  );

  // If redirected to a login/auth page, wait for the user to log in (up to 2 min)
  const currentUrl = page.url();
  if (
    currentUrl.includes("login") ||
    currentUrl.includes("signin") ||
    currentUrl.includes("accounts")
  ) {
    await page.waitForURL(
      (u) =>
        !u.includes("login") &&
        !u.includes("signin") &&
        !u.includes("accounts"),
      { timeout: 120000 }
    );
    // Re-navigate to the target page after login
    await page.goto(
      `https://app.sensortower.com/overview/${appId}?country=${country.toUpperCase()}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
  }

  // Wait until the page has rendered meaningful data (Downloads or Revenue label visible),
  // falling back to a hard 8-second cap if the selector never appears (e.g. paywalled view).
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("Downloads") || document.body.innerText.includes("Revenue"),
      { timeout: 8000 }
    );
  } catch {
    await page.waitForTimeout(8000);
  }

  const text = await page.evaluate(() => document.body.innerText);

  const extract = (pattern) => {
    const match = text.match(pattern);
    return match ? match[1].trim() : "N/A";
  };

  return {
    downloads: extract(/Downloads[^\n]*\n([^\n]+)/i),
    revenue: extract(/Revenue[^\n]*\n([^\n]+)/i),
    publisher: extract(/Publisher\s*\n([^\n]+)/i),
    categories: extract(/Categor(?:y|ies)\s*\n([^\n]+)/i),
    topMarkets: extract(/Top (?:Markets|Countries)\s*\n([^\n]+)/i),
    releaseDate: extract(/(?:Worldwide )?Release Date\s*\n([^\n]+)/i),
    lastUpdated: extract(/(?:Last )?Updated\s*\n([^\n]+)/i),
    languages: extract(/Languages?\s*\n([^\n]+)/i),
    inAppPurchases: extract(/In-App Purchases?\s*\n([^\n]+)/i),
    publisherCountry: extract(/Publisher Country\s*\n([^\n]+)/i),
    adsActive: extract(/(?:Advertis|Ad Network)[^\n]*\n([^\n]+)/i),
    rating: extract(/(\d+\.?\d*)\s*(?:out of 5|★)/i),
    ratingCount: extract(/(\d[\d,]+)\s*(?:ratings?|reviews?)/i),
  };
}

const EMPTY_ST = {
  downloads: "N/A", revenue: "N/A", publisher: "N/A",
  categories: "N/A", topMarkets: "N/A", releaseDate: "N/A",
  lastUpdated: "N/A", languages: "N/A", inAppPurchases: "N/A",
  publisherCountry: "N/A", adsActive: "N/A", rating: "N/A", ratingCount: "N/A",
};

function buildAppProfile(rank, entry, st) {
  return {
    rank,
    name: entry.name,
    appStoreUrl: entry.storeUrl,
    sensorTowerUrl: entry.sensorTowerUrl,
    downloads: st.downloads,
    revenue: st.revenue,
    rating: { score: st.rating, count: st.ratingCount },
    publisher: st.publisher,
    categories: st.categories,
    topMarkets: st.topMarkets,
    releaseDate: st.releaseDate,
    lastUpdated: st.lastUpdated,
    languages: st.languages,
    inAppPurchases: st.inAppPurchases,
    publisherCountry: st.publisherCountry,
    advertisingNetworks: st.adsActive,
  };
}

async function launchContext() {
  try {
    return await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  } catch (err) {
    if (/Executable doesn't exist|playwright install/i.test(err.message)) {
      execSync("npx playwright install chromium", { stdio: "pipe" });
      return await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
    }
    throw err;
  }
}

export async function execute({ keyword, country }) {
  const apps = await searchAppStore(keyword, country);

  // Persistent context so the SensorTower session survives across runs.
  // headless: false lets the user log in on first use; the session is then
  // saved to PROFILE_DIR and reused automatically on every subsequent call.
  const context = await launchContext();

  try {
    const page = await context.newPage();
    const rows = [];

    for (let i = 0; i < apps.length; i++) {
      let st;
      try {
        st = await scrapeSensorTower(page, apps[i].id, country);
      } catch {
        st = EMPTY_ST;
      }
      rows.push(buildAppProfile(i + 1, apps[i], st));
    }

    return JSON.stringify({ keyword, country, fetchedAt: new Date().toISOString(), apps: rows }, null, 2);
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

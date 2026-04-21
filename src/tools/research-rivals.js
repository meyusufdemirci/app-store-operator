import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const PROFILE_DIR = join(homedir(), ".app-store-operator", "profile");

const DESCRIPTION = `Use this tool when the user wants to research rival or competitor apps in the App Store. Trigger phrases include: "rival research", "research rivals", "competitor analysis", "find competing apps", "check competitors", "competitive analysis", "what apps compete with", "App Store competitors", "rivals for keyword", or any variation of researching competing iOS apps.

This tool searches the App Store for a given keyword in a specific country store and returns the top 3 apps with their URLs, SensorTower analytics data, and ratings.

## Step 1 — Gather inputs

The following inputs are **required**. Check if each was provided with the command. For any that are missing, ask the user before proceeding:

- **Keyword**: the search term to look up (e.g. \`psikoloji\`, \`meditation\`)
- **Store**: the two-letter country code for the target store (e.g. \`tr\`, \`us\`, \`gb\`)

Only proceed to Step 2 once both inputs are confirmed.

## Step 2 — Search the App Store

Fetch the search results page using WebFetch:

\`\`\`
https://apps.apple.com/{store}/iphone/search?term={keyword}
\`\`\`

Extract the first 3 app results including:
- App name
- App ID (numeric only, e.g. \`6455378213\` — strip the \`id\` prefix)

## Step 3 — Generate URLs

For each app, generate:
- App Store URL: \`https://apps.apple.com/{store}/app/id{appId}\`
- SensorTower URL: \`https://app.sensortower.com/overview/{appId}\`

## Step 4 — Fetch SensorTower data via Playwright

For each app, use the Playwright MCP tools to fetch Sensor Tower data:

1. Call \`mcp__playwright__browser_navigate\` with \`https://app.sensortower.com/overview/{appId}?country={store}\` (uppercase the store code for the country parameter, e.g. \`TR\`, \`US\`)
2. Call \`mcp__playwright__browser_snapshot\` to capture the page content
3. Parse the snapshot and extract:
   - **Downloads** (Worldwide · Last Month — e.g. \`< 5k\` or exact number)
   - **Revenue** (Worldwide · Last Month — e.g. \`< $5k\` or exact number)
   - **Publisher** (developer/publisher name)
   - **Categories** (e.g. \`Utilities, Productivity\`)
   - **Top Markets** (top countries listed)
   - **Worldwide Release Date**
   - **Last Updated**
   - **Languages** (comma-separated list)
   - **In-App Purchases** (list each item with its duration and price; if none, record \`None\`)
   - **Publisher Country** (country of the developer/publisher)
   - **Advertised on Any Network** (yes/no — whether the app runs paid ads on any ad network)
   - **Rating** (overall average rating, e.g. \`4.7\`)
   - **Rating Count** (total number of ratings/reviews)

Do this sequentially for each app (navigate → snapshot → extract → move to next app).

If a value is not found or gated behind sign-in, record it as \`N/A\`.

## Step 5 — Report

Return a clean report for each app:

---

**#1 — App Name**
- App Store: https://apps.apple.com/{store}/app/id{appId}
- SensorTower: https://app.sensortower.com/overview/{appId}
- Downloads: {value}
- Revenue: {value}
- Rating: {value} ({ratingCount} ratings)
- Publisher: {value}
- Categories: {value}
- Top Markets: {value}
- Worldwide Release Date: {value}
- Last Updated: {value}
- Languages: {value}
- In-App Purchases: {value}
- Publisher Country: {value}
- Advertised on Any Network: {value}`;

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

function formatApp(index, entry, st) {
  return [
    `**#${index + 1} — ${entry.name}**`,
    `- App Store: ${entry.storeUrl}`,
    `- SensorTower: ${entry.sensorTowerUrl}`,
    `- Downloads: ${st.downloads}`,
    `- Revenue: ${st.revenue}`,
    `- Rating: ${st.rating} (${st.ratingCount} ratings)`,
    `- Publisher: ${st.publisher}`,
    `- Categories: ${st.categories}`,
    `- Top Markets: ${st.topMarkets}`,
    `- Worldwide Release Date: ${st.releaseDate}`,
    `- Last Updated: ${st.lastUpdated}`,
    `- Languages: ${st.languages}`,
    `- In-App Purchases: ${st.inAppPurchases}`,
    `- Publisher Country: ${st.publisherCountry}`,
    `- Advertised on Any Network: ${st.adsActive}`,
  ].join("\n");
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
      rows.push(formatApp(i, apps[i], st));
    }

    return rows.join("\n\n---\n\n");
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

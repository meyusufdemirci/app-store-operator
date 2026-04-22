import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import store from "app-store-scraper";

export const PROFILE_DIR = join(homedir(), ".app-store-operator", "profile");

export async function searchAppStore(keyword, country, limit = 3) {
  const results = await store.search({ term: keyword, country, num: limit });
  return results.slice(0, limit).map((app) => ({
    name: app.title,
    id: String(app.id),
    storeUrl: app.url.split("?")[0],
    sensorTowerUrl: `https://app.sensortower.com/overview/${app.id}`,
  }));
}

export async function lookupAppsByIds(appIds, country) {
  const url = `https://itunes.apple.com/lookup?id=${appIds.join(",")}&country=${country}&entity=software`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`App Store lookup failed: ${res.status}`);
  const data = await res.json();
  const byId = Object.fromEntries(
    data.results.filter((r) => r.trackId).map((r) => [String(r.trackId), r])
  );
  return appIds.map((id) => {
    const app = byId[id];
    return {
      name: app?.trackName ?? id,
      id,
      storeUrl: `https://apps.apple.com/${country}/app/id${id}`,
      sensorTowerUrl: `https://app.sensortower.com/overview/${id}`,
    };
  });
}

export const EMPTY_ST = {
  downloads: "N/A", revenue: "N/A", publisher: "N/A",
  categories: "N/A", topMarkets: "N/A", releaseDate: "N/A",
  lastUpdated: "N/A", languages: "N/A", inAppPurchases: "N/A",
  publisherCountry: "N/A", adsActive: "N/A", rating: "N/A", ratingCount: "N/A",
};

export async function scrapeSensorTower(page, appId, country) {
  await page.goto(
    `https://app.sensortower.com/overview/${appId}?country=${country.toUpperCase()}`,
    { waitUntil: "load", timeout: 60000 }
  );

  const currentUrl = page.url();
  if (
    currentUrl.includes("login") ||
    currentUrl.includes("signin") ||
    currentUrl.includes("accounts")
  ) {
    await page.waitForURL(
      (u) => !u.includes("login") && !u.includes("signin") && !u.includes("accounts"),
      { timeout: 120000 }
    );
    await page.goto(
      `https://app.sensortower.com/overview/${appId}?country=${country.toUpperCase()}`,
      { waitUntil: "load", timeout: 60000 }
    );
  }

  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("Downloads") || document.body.innerText.includes("Revenue"),
      { timeout: 30000 }
    );
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 20000));
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

export function buildAppProfile(rank, entry, st) {
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

export async function launchContext() {
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

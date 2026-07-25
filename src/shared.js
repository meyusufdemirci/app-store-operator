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

export async function checkIsLoggedIn(page) {
  await page.goto("https://app.sensortower.com/", { waitUntil: "load", timeout: 30000 });
  const url = page.url();
  return !url.includes("login") && !url.includes("signin") && !url.includes("accounts");
}

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

  // KPI cards: downloads and revenue live in span.MuiTypography-h1, not the subtitle text
  const kpiValues = await page.evaluate(() => {
    const result = {};
    const cards = document.querySelectorAll('div[class*="CardKpi-module__card"]');
    cards.forEach((card) => {
      const titleEl = card.querySelector('h4[class*="CardKpi-module__title"]');
      const valueEl = card.querySelector(
        'span[class*="AppOverviewKpiStatLink-module__link"], span.MuiTypography-h1'
      );
      if (titleEl && valueEl) {
        result[titleEl.textContent.trim()] = valueEl.textContent.trim();
      }
    });
    return result;
  });

  // BaseStatistic cards: categories, top markets, publisher, ads
  const stats = await page.evaluate(() => {
    const result = {};
    document.querySelectorAll('div[class*="BaseStatistic-module__statistic"]').forEach((stat) => {
      const label = stat.querySelector('[class*="BaseStatistic-module__label"]');
      if (!label) return;
      const vals = [...stat.querySelectorAll("a, span:not([class*='label'])")].map((e) => e.textContent.trim()).filter(Boolean);
      result[label.textContent.trim()] = vals.join(", ");
    });
    return result;
  });

  // Publisher link in the app header
  const publisher = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/publisher/ios/"]');
    return link ? link.textContent.trim() : null;
  });

  // Capture full innerText before clicking any tabs (clicking changes the visible DOM)
  const text = await page.evaluate(() => document.body.innerText);

  // Ratings and Reviews tab: rating score lives in aria-label of .MuiRating-root
  let rating = "N/A";
  let ratingCount = "N/A";
  try {
    await page.locator('[role="tab"]').filter({ hasText: "Ratings and Reviews" }).click({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 2000));
    const ratingData = await page.evaluate(() => {
      const ratingEl = document.querySelector(".MuiRating-root");
      const ariaLabel = ratingEl?.getAttribute("aria-label") ?? "";
      const scoreMatch = ariaLabel.match(/(\d+\.?\d*)\s*Stars?/i);
      const score = scoreMatch ? scoreMatch[1] : null;

      // The count is not in the aria-label, and the pre-click innerText capture
      // above predates this panel — so re-read the text here. Several shapes are
      // tried because this markup has drifted before.
      const panelText = document.body.innerText;
      const NUM = String.raw`\d[\d,.]*\s*[KMB]?`;
      const patterns = [
        new RegExp(`(${NUM})\\s*(?:total\\s+)?ratings\\b`, "i"),
        new RegExp(`total\\s+ratings\\D{0,20}(${NUM})`, "i"),
        new RegExp(`\\bratings\\b\\s*[:\\n]\\s*(${NUM})`, "i"),
      ];

      let count = null;
      for (const pattern of patterns) {
        const value = panelText.match(pattern)?.[1]?.trim();
        // Guard against re-capturing the score itself out of e.g. "4.7 Ratings".
        if (value && value !== score) {
          count = value;
          break;
        }
      }

      return { score, count, ariaLabel, foundRatingEl: Boolean(ratingEl), sample: panelText.slice(0, 1500) };
    });
    rating = ratingData.score ?? "N/A";
    ratingCount = ratingData.count ?? "N/A";

    // Set ASO_DEBUG_RATINGS=1 to dump what the page actually offered when either
    // field comes back empty. stderr is safe here — stdout is the JSON-RPC channel.
    if (process.env.ASO_DEBUG_RATINGS && (rating === "N/A" || ratingCount === "N/A")) {
      console.error(
        "[aso:ratings] incomplete extraction",
        JSON.stringify({ score: rating, count: ratingCount, ariaLabel: ratingData.ariaLabel, foundRatingEl: ratingData.foundRatingEl, sample: ratingData.sample }, null, 2),
      );
    }
  } catch (err) {
    if (process.env.ASO_DEBUG_RATINGS) console.error("[aso:ratings] Ratings and Reviews tab unreachable:", err.message);
  }
  const extract = (pattern) => {
    const match = text.match(pattern);
    return match ? match[1].trim() : "N/A";
  };

  return {
    downloads: kpiValues["Downloads"] ?? "N/A",
    revenue: kpiValues["Revenue"] ?? "N/A",
    publisher: publisher ?? stats["Support URL"] ?? "N/A",
    categories: stats["Categories"] ?? extract(/Categor(?:y|ies)[^\n]*\n([^\n]+)/i),
    topMarkets: stats["Top Countries / Regions"] ?? stats["Top Markets"] ?? "N/A",
    releaseDate:
      extract(/Worldwide Release Date:[^\n]*\n+([^\n]+)/i) !== "N/A"
        ? extract(/Worldwide Release Date:[^\n]*\n+([^\n]+)/i)
        : extract(/Country Release Date:[^\n]*\n+([^\n]+)/i),
    lastUpdated: extract(/Last Updated:[^\n]*\n+([^\n]+)/i),
    languages: extract(/Languages?:[^\n]*\n+([^\n]+)/i),
    inAppPurchases: extract(/In-App Purchases?[^\n]*\n[^\n]+\n([^\n]+)/i),
    publisherCountry: extract(/Publisher Country:[^\n]*\n+([^\n]+)/i),
    adsActive: stats["Advertised on Any Network"] ?? extract(/(?:Advertis|Ad Network)[^\n]*\n([^\n]+)/i),
    rating,
    ratingCount,
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

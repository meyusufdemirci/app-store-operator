import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

const CACHE_FILE = join(homedir(), ".app-store-operator", "cache.json");
const TTL_MS = (Number(process.env.ASO_CACHE_TTL_HOURS ?? 24)) * 60 * 60 * 1000;

function load() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(store) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function cacheKey(keyword, country) {
  return `${country.toLowerCase()}:${keyword.toLowerCase()}`;
}

export function getCached(keyword, country) {
  const store = load();
  const entry = store[cacheKey(keyword, country)];
  if (!entry) return null;
  if (Date.now() - new Date(entry.cachedAt).getTime() > TTL_MS) return null;
  return entry.data;
}

export function setCached(keyword, country, data) {
  const store = load();
  store[cacheKey(keyword, country)] = { cachedAt: new Date().toISOString(), data };
  save(store);
}

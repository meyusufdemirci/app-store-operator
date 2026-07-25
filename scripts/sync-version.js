#!/usr/bin/env node

// Copies package.json's version into the two slots server.json carries it in and
// into the copy manifest.json carries for the MCPB bundle, then promotes
// CHANGELOG.md's "## Unreleased" heading to that same version. Run by the
// `version` npm lifecycle script, which fires after the bump but *before* the
// commit, so `npm version <bump>` folds every one of them into the single commit
// .github/workflows/publish.yml later checks against the tag.
//
// `--check` validates the changelog and writes nothing. That half is wired to
// `preversion`, which runs before package.json is bumped, so notes that were
// never written abort the release with the working tree still untouched.
//
// Every surface that reads a version from this repo must be listed here. A file
// left out drifts silently and aggregators cache the stale number — which is
// how the LobeHub listing ended up four releases behind.

import { readFileSync, writeFileSync } from "fs";

const CHANGELOG = "CHANGELOG.md";
const UNRELEASED = "## Unreleased";
const HINT =
  "<!-- Add lines here as you go; `npm version` promotes this heading to the version you cut. -->";

// Splits the file around the Unreleased section. Sections are delimited by "## "
// headings — the same rule publish.yml's awk uses to carve out the release body,
// so what is promoted here is exactly what gets published. Null when there is no
// Unreleased heading at all.
function splitUnreleased(lines) {
  const start = lines.findIndex((line) => line.trimEnd() === UNRELEASED);
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  return {
    before: lines.slice(0, start).join("\n"),
    body: lines.slice(start + 1, end).join("\n"),
    after: lines.slice(end).join("\n"),
  };
}

// The notes minus the placeholder comment sitting above them. HTML comments
// render as nothing on GitHub, so a section carrying only the hint would publish
// a blank release body — treat it as empty.
function notesOf(body) {
  return body.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, "").trim();
}

const lines = readFileSync(CHANGELOG, "utf8").split("\n");
const section = splitUnreleased(lines);

if (!section) {
  console.error(`${CHANGELOG} has no "${UNRELEASED}" heading to promote.`);
  process.exit(1);
}

const notes = notesOf(section.body);

if (!notes) {
  console.error(
    `${CHANGELOG}'s "${UNRELEASED}" section is empty — write the release notes ` +
      `before cutting a version. Publishing without them falls back to raw commit ` +
      `subjects for the GitHub release body.`
  );
  process.exit(1);
}

if (process.argv.includes("--check")) {
  console.log(`${CHANGELOG} has notes ready under "${UNRELEASED}".`);
  process.exit(0);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

if (lines.some((line) => line.trimEnd() === `## ${version}`)) {
  console.error(`${CHANGELOG} already has a "## ${version}" section.`);
  process.exit(1);
}

const server = JSON.parse(readFileSync("server.json", "utf8"));

server.version = version;
server.packages[0].version = version;

writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
console.log(`server.json synced to ${version}.`);

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

manifest.version = version;

writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json synced to ${version}.`);

// Promote the notes and leave an empty Unreleased section above them, so the
// next release has somewhere to write to without anyone re-adding the heading.
writeFileSync(
  CHANGELOG,
  [
    section.before.trimEnd(),
    "",
    UNRELEASED,
    "",
    HINT,
    "",
    `## ${version}`,
    "",
    notes,
    "",
    section.after.trim(),
  ]
    .join("\n")
    .trimEnd() + "\n"
);
console.log(`${CHANGELOG}'s "${UNRELEASED}" section promoted to ${version}.`);

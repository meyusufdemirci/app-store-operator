# Changelog

Notes are written for the people who *use* the server — what changed about the
tools, the data they return, and how you install or run it. Plumbing that has no
effect on a user (CI, refactors, docs-only tweaks) belongs in the commit log, not
here; if a release has none, say so in one line.

The release workflow reads the section whose heading matches the tag and uses it
verbatim as the GitHub release body, so write each entry in the form you'd want a
stranger to read it.

Format: one `## <version>` section per release, newest first. Group lines under
`### Added` / `### Changed` / `### Fixed` when a release has more than a couple.

Write as you go under `## Unreleased`; `npm version` renames that heading to the
version being cut and opens a fresh one. It refuses to run while the section is
empty, so a release never ships with auto-generated commit subjects for notes.

## Unreleased

<!-- Add lines here as you go; `npm version` promotes this heading to the version you cut. -->

- Nothing changed about the tools themselves. The four tools, six prompts and
  seven resources behave exactly as they did in 0.3.4 — this release is the
  install experience around them.
- The Claude Desktop bundle is no longer the whole repository. Packing it used to
  zip everything in the working tree, `node_modules` included, so the download
  was many times the size of the server it installs. It now carries the server,
  its manifest and icon, and the README — the tests, CI config, release script
  and the metadata files meant for other registries are left out.

## 0.3.4

### Added

- Six prompts — ready-made workflows that already chain the tools, so you no
  longer have to describe the sequence yourself. In Claude Code they show up as
  slash commands: `competitor_snapshot` (how contested is this keyword),
  `keyword_shortlist` (which keywords are worth targeting), `app_teardown` (what
  is this rival actually doing), `positioning_gap` (where your app stands against
  the incumbents), `metadata_rewrite` (name, subtitle, and keyword field with
  character counts), and `in_app_event` (the full In-App Event flow). Each one
  tells the assistant not to invent figures, and the ones that scrape tell it not
  to quietly swap in a weaker tool when SensorTower asks for a login.
- Resources your client can attach as context without spending a tool call:
  App Store Connect character limits, In-App Event limits and artwork sizes, the
  locales `prepare_iae` accepts, storefront country codes, and a guide to which
  tool costs what. Two more read the local cache — `asops://cache/research` lists
  every keyword you have already researched and whether it is still fresh, and
  `asops://cache/research/{country}/{keyword}` hands back a cached result without
  opening a browser. Nothing here leaves your machine.

### Changed

- Every tool now says up front what it costs you before you call it. The two
  SensorTower tools state that they need an account, open a real browser window,
  and roughly how long a scrape takes; `search_app_store` states that it needs
  none of that but also carries no downloads or revenue figures; `prepare_iae`
  states that it never touches the network. Each tool also says which store it
  covers, so an assistant stops offering them for Android apps.
- Inputs now carry their own limits: country codes must be two letters, app IDs
  must be numeric, `limit` is a whole number between 1 and 25, and `locale`
  lists the locales that actually work instead of leaving you to discover the
  unsupported ones by getting an error back.

## 0.3.3

### Added

- Every tool now has a display name and declares how it behaves. Clients that
  support this show "Research App Store Rivals" rather than `research_rivals`,
  and can tell that all four tools are read-only — none of them change anything
  in your App Store account, on SensorTower, or on your machine beyond the local
  cache. `prepare_iae` additionally declares that it contacts no external service
  at all.
- A privacy policy in the README: what each tool sends and to whom, what is
  stored on your machine and where, and a one-line command to delete all of it.
- Packaging metadata for Claude Desktop, so the server can be installed as a
  desktop extension instead of being wired up by hand.

### Fixed

- `research_rivals` and `get_app_details` now report how many ratings an app has.
  This was always `N/A` in earlier releases.

## 0.3.2

Maintenance release — no changes to the tools or their output.

## 0.3.1

Documentation fixes only. The README no longer promises data the server doesn't
actually return.

## 0.3.0

### Added

- OpenAI Codex is now supported as an MCP client, alongside Claude.
- A published Docker image, so the server can be run in a container instead of
  installed locally.

### Fixed

- Corrected the README's description of how the SensorTower browser window works
  and what the rating data contains.

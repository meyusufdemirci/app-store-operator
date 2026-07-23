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

## Unreleased

<!-- Add lines here as you go; rename this heading to the version when you cut a release. -->

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

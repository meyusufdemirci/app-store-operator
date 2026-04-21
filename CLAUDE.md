# App Store Operator — MCP Server

This project is an MCP server that provides App Store competitive intelligence tools.

## Available MCP Tool: `research_rivals`

**Always call `research_rivals` when the user says anything like:**
- "rival research" / "research rivals"
- "competitor analysis" / "competitive analysis"
- "find competing apps" / "check competitors"
- "what apps rank for [keyword]"
- "search App Store for [keyword]"
- "who are the competitors for [keyword]"
- Any request to analyze or compare competing iOS apps for a keyword

**Required inputs:** keyword (search term) + country (two-letter store code, e.g. `us`, `tr`, `gb`).

If either is missing, ask the user before calling the tool.

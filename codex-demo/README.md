# Codex Workflow Demo: Automated PR Code Review

This demo shows how GPT-5 can be integrated into developer workflows as an automated code reviewer. Given a unified diff (from `git diff`, a `.patch` file, or a CI pipeline), it produces a structured review with risk assessment, line-level feedback, categorized suggestions, and an approval recommendation -- all powered by the OpenAI Responses API.

## Prerequisites

- **Node.js** 20+
- **OpenAI API key** with access to GPT-5

```bash
export OPENAI_API_KEY=sk-...
```

## Quick Start

```bash
cd codex-demo
npm install
node review.mjs example-diff.patch
```

## Usage

```bash
# Review a diff file
node review.mjs path/to/changes.diff

# Review from stdin (pipe from git)
git diff main..feature-branch | node review.mjs

# Generate a short PR summary instead of a full review
node review.mjs --summary example-diff.patch

# Machine-readable JSON output
node review.mjs --json example-diff.patch

# Write review to a file
node review.mjs --output review.md example-diff.patch
```

## Example Output

Running `node review.mjs example-diff.patch` produces output like:

---

## Summary

This PR adds an in-memory rate limiter middleware for Express that caps clients at 100 requests per 60-second window based on IP address.

## Risk Assessment

**Medium** -- The rate limiter uses an in-memory store that will not work correctly across multiple server instances and has no protection against IP spoofing via proxy headers.

## File-by-File Review

**File**: `server/src/middleware/rateLimiter.ts`

- Lines 8-11: Constants and in-memory store are module-scoped, which is fine for a single-process deployment.
- Line 14: Uses `req.ip` directly. Behind a reverse proxy this may resolve to the proxy IP unless `trust proxy` is configured on the Express app.
- Lines 39-42: Cleanup interval runs via `setInterval` with no way to cancel it, which can prevent graceful shutdown and will leak in tests.

## Suggestions

- **[Bug]** `rateLimiter.ts` line 14 -- `req.ip` returns the proxy address when behind a load balancer. Use `req.headers['x-forwarded-for']` or configure Express `trust proxy` setting.
- **[Performance]** `rateLimiter.ts` line 8 -- In-memory store does not scale horizontally. Consider Redis for multi-instance deployments.
- **[Style]** `rateLimiter.ts` line 42 -- The cleanup interval's magic number `300000` should use the `_000` separator (e.g., `300_000`) for consistency with `WINDOW_MS` on line 10.

## Recommendation

**Request Changes** -- The `req.ip` proxy issue is a likely production bug that should be addressed before merge.

---

## How This Connects to Codex Workflows

OpenAI Codex is designed to run as an autonomous software engineering agent that can execute multi-step tasks inside a sandboxed cloud environment. This demo illustrates one high-value pattern: **automated code review as part of a CI/CD pipeline**.

In a production Codex deployment, this review step would:
1. Trigger on every pull request via GitHub Actions or a webhook
2. Post the structured review as a PR comment
3. Block merge on high-risk findings until a human approves
4. Feed review outcomes back to improve prompt calibration over time

The same Responses API integration pattern used here powers the DocScope MCP tools in the parent project, demonstrating end-to-end fluency with OpenAI's latest APIs.

## Related

This demo is part of the [DocScope](../) project -- a ChatGPT App for developer documentation intelligence built with the MCP Apps SDK.

# DocScope — ChatGPT App Directory Submission

Prepared for submission at https://platform.openai.com/apps-manage

---

## 1. App Listing Info

### App Name: **DocScope**

**Name review note:** "DocScope" is a two-word compound name clearly tied to its function (documentation + scope/search). It is not a single-word dictionary term, so it should pass the naming guidelines. However, if rejected for being too generic, consider "DocScope Dev" or "DocScope API" as alternatives.

### Short Description (directory listing)

Search, explore, and test API documentation inside ChatGPT. DocScope indexes Stripe and Twilio APIs with hybrid semantic search, structured endpoint cards, and live API testing.

### Long Description

DocScope is a developer tool that brings API documentation intelligence directly into ChatGPT. Instead of switching between docs tabs and your editor, ask ChatGPT questions about API endpoints and get structured, accurate answers powered by a RAG pipeline.

**What you can do:**

- **Search docs** — Hybrid semantic + keyword search across indexed API documentation (currently Stripe and Twilio). Results are ranked by relevance with snippet previews.
- **Fetch full documents** — Retrieve complete documentation pages for any search result to get the full context.
- **Explore endpoints** — Get structured endpoint details including parameters, request/response schemas, code examples, and error codes. Rendered as interactive endpoint cards in the widget.
- **Test endpoints live** — Execute real API calls against Stripe or Twilio from inside ChatGPT using your own API key. Keys are used once and never stored.
- **Debug errors** — Look up API error codes and HTTP statuses to get common causes, resolution steps, and links to related endpoints.

The widget UI renders endpoint cards, request builders, response viewers, and error cards directly in the ChatGPT iframe for a seamless developer experience.

### Support Contact

Scott Allen — scottwallen3434@gmail.com

### Company URL

https://github.com/swa34/openRes

### Privacy Policy URL

`[TODO — must be published at a publicly accessible URL before submission]`

---

## 2. Tool Annotation Justifications

The submission form requires a detailed justification for each annotation on each tool. Below are the justifications written for the reviewer.

### Tool 1: `search` — Search documentation

| Annotation | Value | Justification |
|---|---|---|
| `readOnlyHint` | `true` | This tool strictly retrieves data. It performs a semantic + keyword search query against a Pinecone vector index and returns ranked document snippets. It does not create, update, delete, or send any data. The only side effect is a Redis cache write (internal to the server, not user-facing), which stores search results to speed up repeat queries. No external state is modified. |
| `destructiveHint` | `false` | This tool cannot cause any irreversible outcomes. It only reads from a vector database and returns results. No data is created, modified, or deleted in any user-facing or external system. |
| `openWorldHint` | `false` | This tool operates entirely within closed, private systems. It queries an internal Pinecone index and Redis cache. It does not post, publish, send, or write to any publicly visible internet resource. All data flows are server-internal read operations. |

### Tool 2: `fetch` — Fetch document

| Annotation | Value | Justification |
|---|---|---|
| `readOnlyHint` | `true` | This tool retrieves the full text of a single document by its vector ID from Pinecone. It is a pure read operation — it fetches a record and returns its contents. No data is created, updated, or deleted. |
| `destructiveHint` | `false` | This tool performs only a vector database fetch-by-ID. It cannot cause any irreversible outcomes. No data is modified or deleted in any system. |
| `openWorldHint` | `false` | This tool operates entirely within a closed system (Pinecone vector database). It does not interact with any public-facing resource, does not send data externally, and does not change any publicly visible state. |

### Tool 3: `get_endpoint` — Get API endpoint details

| Annotation | Value | Justification |
|---|---|---|
| `readOnlyHint` | `true` | This tool looks up a pre-parsed API endpoint from an in-memory store populated at server startup by the ingestion pipeline. It returns structured endpoint data (parameters, schemas, examples, error codes). It is a pure read from an internal data structure — no external calls, no writes, no state changes. |
| `destructiveHint` | `false` | This tool reads from a static in-memory Map. It cannot cause any irreversible outcomes. No data is modified, deleted, or sent anywhere. |
| `openWorldHint` | `false` | This tool operates entirely within the server's memory. It does not make any network calls, does not interact with external systems, and does not change any publicly visible internet state. |

### Tool 4: `test_endpoint` — Test API endpoint

| Annotation | Value | Justification |
|---|---|---|
| `readOnlyHint` | `false` | This tool makes live HTTP requests to external API endpoints (Stripe, Twilio). While most test calls are GET requests that only read data, the tool also supports POST, PUT, PATCH, and DELETE methods, which can create, modify, or delete resources in the user's API account. Therefore it is not read-only. |
| `destructiveHint` | `false` | While the tool can invoke DELETE or overwrite methods on external APIs, it does not do so autonomously — the user must explicitly provide the HTTP method, path, and API key. The tool itself does not default to any destructive action. The user has full control over what request is made. The tool also has an SSRF guard and URL allowlist (only `api.stripe.com` and `api.twilio.com`) to constrain scope. API keys are used once and immediately discarded — never stored. |
| `openWorldHint` | `true` | This tool sends HTTP requests to external, publicly accessible API servers (Stripe and Twilio). These requests can change state in the user's API account (e.g., creating a charge, sending an SMS). This constitutes interaction with systems outside a private/first-party context, so `openWorldHint` must be `true`. |

### Tool 5: `debug_error` — Debug API error

| Annotation | Value | Justification |
|---|---|---|
| `readOnlyHint` | `true` | This tool looks up an error code, error message, or HTTP status from an in-memory error catalog populated at server startup. It returns common causes, resolution steps, and related endpoints. It is a pure read from an internal data structure — no external calls, no writes, no state changes. |
| `destructiveHint` | `false` | This tool reads from a static in-memory Map. It cannot cause any irreversible outcomes. No data is modified, deleted, or sent anywhere. |
| `openWorldHint` | `false` | This tool operates entirely within the server's memory. It does not make any network calls, does not interact with external systems, and does not change any publicly visible internet state. |

---

## 3. Screenshot Guidance

The submission form requires screenshots that accurately represent the app's functionality. The OpenAI docs state screenshots must "comply with the required dimensions" — exact pixel dimensions are specified in the dashboard submission form (check when submitting). Capture at the resolution the form requests.

### Screenshots to Capture

1. **Search results view**
   - Prompt: "How do I create a charge in Stripe?"
   - Show: ChatGPT response with search results, the widget rendering a list of matched documentation snippets with titles, relevance scores, and source links.
   - Why: Demonstrates the core search capability and the widget UI.

2. **Endpoint card (structured detail)**
   - Prompt: "Show me the parameters for POST /v1/charges on Stripe"
   - Show: The widget rendering a full endpoint card with method badge, path, parameters table, request body schema, and code example.
   - Why: Demonstrates the structured data presentation that goes beyond plain text.

3. **Live API test (request builder + response)**
   - Prompt: "Test GET /v1/balance on Stripe with my key"
   - Show: The widget displaying the request builder with method/path, and the response viewer showing status code, latency, and response body.
   - Why: Demonstrates the interactive testing capability — the most differentiated feature.

4. **Error debugging**
   - Prompt: "I'm getting a card_declined error from Stripe, what does that mean?"
   - Show: The widget rendering an error card with the error code, HTTP status, common causes, and resolution steps.
   - Why: Demonstrates the error debugging workflow.

5. **Multi-API search (optional)**
   - Prompt: "How do I send an SMS?" (no API specified)
   - Show: Results from both Stripe and Twilio, demonstrating cross-API search.
   - Why: Shows the app works across multiple API sources.

### Screenshot Tips
- Use ChatGPT web app (not mobile) for primary screenshots
- Ensure the widget iframe is fully loaded before capturing
- Use realistic prompts that a developer would actually ask
- Avoid any personal data, API keys, or account identifiers in the screenshots

---

## 4. Localization

### Supported Countries

All countries where ChatGPT is available. DocScope does not process location-dependent data, does not collect user location, and serves API documentation that is globally applicable.

### Supported Languages

**English only** — all indexed documentation (Stripe, Twilio) is in English. Tool descriptions, error messages, and widget UI are in English.

If demand warrants, additional languages can be added in future versions by ingesting localized documentation.

---

## 5. Pre-submission Checklist

### Organization & Account
- [ ] Organization identity verified in [OpenAI Platform Dashboard](https://platform.openai.com/settings/organization/general)
  - Individual verification (Scott Allen) OR business verification
- [ ] Account has **Owner** role in the organization
- [ ] Using a project with **global** data residency (not EU)

### Privacy & Legal
- [ ] Privacy policy published at a publicly accessible URL
- [ ] Privacy policy covers: categories of data collected, purposes of use, categories of recipients, user controls
- [ ] Privacy policy discloses that `test_endpoint` accepts (but does not store) user API keys
- [ ] No restricted data collection (PCI, PHI, government IDs, credentials stored)
- [ ] Tool responses audited — no unnecessary PII, telemetry IDs, or internal identifiers leaked

### MCP Server
- [ ] MCP server live at `https://openres-production.up.railway.app/mcp`
- [ ] Server is publicly accessible (not behind VPN, firewall, or auth wall)
- [ ] Content Security Policy (CSP) configured with correct `frameDomains`
- [ ] Server responds reliably with low latency (test from multiple locations)
- [ ] Error handling returns clear messages, no crashes or hangs

### Tools & Annotations
- [ ] All 5 tools have `readOnlyHint`, `destructiveHint`, and `openWorldHint` annotations set
- [ ] Annotation justifications written (see Section 2 above)
- [ ] Tool names are descriptive and unique
- [ ] Tool descriptions accurately match behavior
- [ ] Input schemas request only minimum necessary data
- [ ] No tool requests full conversation history or broad context
- [ ] `test_endpoint` API keys only appear in `_meta`, never in `structuredContent` or logs
- [ ] Remove `requestId` and `traceId` from any error response bodies (see known issues)

### Test Prompts
- [ ] Prepare 3-5 test prompts with expected responses for each tool
- [ ] Test prompts validated on ChatGPT web app
- [ ] Test prompts validated on ChatGPT mobile app
- [ ] Widget renders correctly for all test cases
- [ ] Expected responses are clear and unambiguous

### Screenshots
- [ ] Screenshots captured per Section 3 guidance
- [ ] Screenshots match required dimensions (check dashboard form)
- [ ] Screenshots accurately represent actual app behavior
- [ ] No personal data or API keys visible in screenshots

### Final Checks
- [ ] App name, logo, descriptions filled in
- [ ] Company URL and privacy policy URL provided
- [ ] Localization settings configured (countries, language)
- [ ] All confirmation boxes checked in submission form
- [ ] Review [UX principles checklist](https://developers.openai.com/apps-sdk/concepts/ux-principles/#checklist-before-publishing) before submitting

---

## References

- [App Submission Guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines/)
- [Submit and Maintain Your App](https://developers.openai.com/apps-sdk/deploy/submission/)
- [UX Principles](https://developers.openai.com/apps-sdk/concepts/ux-principles/)
- [UI Guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines/)
- [Tool Annotations Reference](https://developers.openai.com/apps-sdk/reference#annotations)
- [OpenAI Platform Dashboard](https://platform.openai.com/apps-manage)

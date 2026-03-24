# DocScope Privacy Policy

**Effective date:** March 24, 2026
**Last updated:** March 24, 2026
**Developer:** Scott Allen — scottwallen3434@gmail.com

DocScope is a ChatGPT App that helps developers search, understand, and debug API documentation. This privacy policy explains what data DocScope processes, how it is used, and what controls you have.

---

## 1. What Data DocScope Processes

DocScope processes the following categories of data during normal operation:

### Search queries
When you use the **search**, **fetch**, **get_endpoint**, or **debug_error** tools, DocScope receives the text of your query or lookup parameters (such as an API name, endpoint path, or error code). These inputs are used solely to retrieve relevant documentation results.

### API keys (test_endpoint tool only)
The **test_endpoint** tool accepts an API key you provide in order to make a live HTTP request to a third-party API on your behalf. This key is used for that single request and is never logged, stored, or transmitted to any party other than the target API you specified.

### IP addresses
DocScope uses your IP address solely for in-memory rate limiting (a sliding window counter). IP addresses are held in server memory only and are automatically pruned when they become stale. They are never written to disk, logged to files, or shared with any third party.

### Request metadata
Each request is assigned a short-lived trace ID for debugging purposes. Trace IDs are not linked to any personal information and are discarded when the request completes.

---

## 2. How Data Is Used

| Data | Purpose | Retention |
|---|---|---|
| Search query text | Converted to an embedding, compared against cached results, and if needed, used to query Pinecone for relevant documentation chunks | Transient. Cached embeddings expire after 1 hour in Redis. No queries are persisted to disk. |
| API key (test_endpoint) | Passed as an authorization header to the third-party API endpoint you specify | Transient. Used for the duration of a single HTTP request. Never logged or stored. |
| IP address | In-memory rate limiting (60 requests per minute per IP) | Transient. Held in server memory; pruned every 5 minutes. Never written to disk. |
| Trace ID | Correlate log lines for a single request | Transient. Exists only for the lifetime of the HTTP connection. |

---

## 3. What DocScope Does NOT Store

- DocScope does **not** persist your search queries, conversation history, or any user-generated content to any database or file system.
- DocScope does **not** store, log, or cache API keys. Keys provided to the test_endpoint tool are used for a single outbound request and then discarded.
- DocScope does **not** collect personal identifiers such as names, email addresses, or account IDs.
- DocScope does **not** engage in behavioral profiling, tracking, or surveillance.
- DocScope does **not** collect location data, payment information, health information, or government identifiers.

---

## 4. Third-Party Services

DocScope relies on the following third-party services to function. Each service receives only the minimum data required for its role:

| Service | Role | Data received |
|---|---|---|
| **Pinecone** (Pinecone Systems, Inc.) | Vector database for documentation search | Query embedding vectors (numerical arrays). No raw query text is sent. |
| **OpenAI** (OpenAI, LLC) | Generates text embeddings for search queries; provides the ChatGPT platform that hosts DocScope | Query text (for embedding generation). Subject to [OpenAI's privacy policy](https://openai.com/policies/privacy-policy). |
| **Redis** (self-hosted, in-memory) | Semantic cache to reduce redundant searches | Query embedding hashes and cached search results. All data is in-memory with a 1-hour TTL. |
| **Target third-party APIs** (e.g., Stripe, Twilio) | Receive proxied test requests when you use the test_endpoint tool | The HTTP request you construct, including the API key you provide. DocScope acts as a pass-through. |

DocScope does not sell, rent, or share any user data with third parties for advertising, marketing, or any purpose unrelated to providing the service.

---

## 5. Data Retention

DocScope is designed to be transient by default:

- **No long-term storage.** There is no user database, no analytics store, and no persistent logging of user queries or API keys.
- **Redis cache entries** expire automatically after 1 hour (TTL-based eviction).
- **Rate-limit counters** are pruned from memory every 5 minutes and are never persisted.
- **Server logs** (stdout via pino) may contain tool invocation metadata (tool name, API name, result count, latency) but never contain query text content, API keys, or personally identifiable information. API keys are explicitly redacted before logging.

---

## 6. Categories of Recipients

| Recipient | What they receive | Why |
|---|---|---|
| **OpenAI** | Tool inputs and outputs as part of the ChatGPT Apps platform | Required for the app to function within ChatGPT |
| **Pinecone** | Query embedding vectors | Required for vector similarity search |
| **Target API providers** (when using test_endpoint) | The HTTP request you construct | Required to execute the live API test you requested |

No other parties receive any data from DocScope.

---

## 7. User Controls

- **You choose what to send.** Every tool invocation in ChatGPT requires your approval before it runs. You can review the inputs before confirming.
- **You can stop using DocScope at any time.** Since DocScope does not maintain user accounts or store persistent data, there is nothing to delete. Disconnecting the app in ChatGPT immediately stops all data processing.
- **API keys are under your control.** The test_endpoint tool only runs when you explicitly provide an API key. You can revoke the key with the issuing provider at any time.
- **Rate limiting is automatic.** If you exceed 60 requests per minute, subsequent requests are temporarily blocked. This protects both you and the service.

---

## 8. Children's Privacy

DocScope is a developer tool and is not directed at children under 13. We do not knowingly collect personal information from children.

---

## 9. Changes to This Policy

If this policy changes, the updated version will be published at the same URL with a new "Last updated" date. Material changes will be noted at the top of the document.

---

## 10. Contact

For questions or concerns about this privacy policy or DocScope's data practices:

**Scott Allen**
Email: scottwallen3434@gmail.com
GitHub: [github.com/swa34](https://github.com/swa34)

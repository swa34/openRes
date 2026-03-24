# DocScope -- Test Prompts for App Directory Submission

These test prompts are designed for OpenAI reviewers to verify DocScope in ChatGPT (web and mobile). Each test case specifies the exact prompt, which tool(s) should fire, what the response should contain, and whether a widget card renders.

> **Reviewer note:** DocScope is a read-only documentation intelligence app. All tools are non-destructive and require no authentication from the end user.

---

## Test Case 1: Basic documentation search (Stripe)

**Prompt:**
```
How do I create a Stripe PaymentIntent?
```

**Expected tool(s):** `search` (with `api: "stripe"` or all-API search that includes Stripe results)

**Expected behavior:**
- The response explains how to create a PaymentIntent using `POST /v1/payment_intents`.
- It mentions the required parameters `amount` and `currency`.
- It references `client_secret` as part of the response object or the confirm flow.
- The response includes a link to Stripe documentation (e.g., `docs.stripe.com/api/payment_intents`).
- The answer is concise and developer-focused -- not a generic chatbot reply.

**Widget:** Yes -- a results card should appear showing ranked documentation results with titles, snippets, and relevance scores.

---

## Test Case 2: Cross-API search (Twilio)

**Prompt:**
```
How do I send an SMS message with Twilio?
```

**Expected tool(s):** `search` (with `api: "twilio"` or all-API search that includes Twilio results)

**Expected behavior:**
- The response describes using the Twilio Messages resource (`POST /2010-04-01/Accounts/{AccountSid}/Messages`).
- It mentions the required parameters `To`, `From` (or `MessagingServiceSid`), and `Body`.
- It may reference the Twilio helper library or direct REST API usage.
- A documentation URL pointing to `twilio.com/docs` is included.
- The response should NOT return Stripe results as the primary answer.

**Widget:** Yes -- a results card should appear showing Twilio documentation results.

---

## Test Case 3: Endpoint detail lookup

**Prompt:**
```
Show me the full details for POST /v1/charges in the Stripe API.
```

**Expected tool(s):** `get_endpoint` (with `api: "stripe"`, `path: "/v1/charges"`, `method: "POST"`)

**Expected behavior:**
- The response shows the endpoint schema for `POST /v1/charges`.
- It lists parameters such as `amount` (required), `currency` (required), and `source` or `payment_method`.
- It includes the base URL (`https://api.stripe.com`).
- It may show request body shape, response fields, or example error codes associated with this endpoint.
- The summary or description field for the endpoint is present.

**Widget:** Yes -- an endpoint detail card should render showing method, path, parameters, and optionally request/response schemas.

---

## Test Case 4: Error debugging

**Prompt:**
```
I'm getting a card_declined error from Stripe. What does it mean and how do I fix it?
```

**Expected tool(s):** `debug_error` (with `api: "stripe"`, `errorCode: "card_declined"`)

**Expected behavior:**
- The response identifies `card_declined` as a `card_error` type with HTTP status `402`.
- It lists common causes such as insufficient funds, lost/stolen card, or issuer decline.
- It provides actionable resolution steps (e.g., ask the customer to use a different card, retry with a different payment method, check if the card is expired).
- It may reference related endpoints like `/v1/charges` or `/v1/payment_intents`.
- The tone is diagnostic and helpful -- not just a definition.

**Widget:** Yes -- an error detail card should appear showing the error code, HTTP status, causes, and suggested fixes.

---

## Test Case 5: Multi-turn conversation (search then endpoint details)

### Turn 1

**Prompt:**
```
What endpoints does Stripe provide for managing subscriptions?
```

**Expected tool(s):** `search` (with `api: "stripe"` or all-API, query about subscriptions)

**Expected behavior:**
- The response mentions the `/v1/subscriptions` endpoint and related operations (create, retrieve, update, cancel/delete).
- It may also reference related resources like `/v1/prices`, `/v1/invoices`, or `/v1/subscription_items`.
- Key concepts like `customer`, `items`, `price`, `billing_cycle_anchor`, and `trial_period_days` appear.
- Documentation links are provided.

**Widget:** Yes -- a results card with subscription-related documentation hits.

### Turn 2 (follow-up in the same conversation)

**Prompt:**
```
Show me the full endpoint details for POST /v1/subscriptions.
```

**Expected tool(s):** `get_endpoint` (with `api: "stripe"`, `path: "/v1/subscriptions"`, `method: "POST"`)

**Expected behavior:**
- The response displays the full schema for creating a subscription.
- Required parameters like `customer` and `items` (with nested `price`) are listed.
- Optional parameters such as `default_payment_method`, `trial_period_days`, and `billing_cycle_anchor` are shown.
- The response builds naturally on the context from Turn 1 -- it should feel like a continuation, not a cold start.

**Widget:** Yes -- an endpoint detail card for `POST /v1/subscriptions`.

---

## Notes for Reviewers

- **All tools are read-only.** DocScope does not create, modify, or delete any external resources. Tool annotations reflect this (`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`).
- **No authentication required.** DocScope searches pre-indexed public API documentation. There is no OAuth flow or user login.
- **Widget cards** render inline in the ChatGPT conversation via the MCP Apps UI bridge. On mobile, cards should be scrollable and tap-friendly. If a widget fails to load, the text response still contains all relevant information.
- **Cache behavior.** Repeated identical queries may return faster due to Redis semantic caching. Results should be consistent regardless of cache state.
- **Model variation.** The exact phrasing of responses will vary between runs. The criteria above focus on *what information must be present*, not exact wording.

/**
 * DocScope — OpenAPI spec parser
 *
 * Parses OpenAPI 3.0/3.1 YAML or JSON specs into ParsedEndpoint[] for
 * downstream chunking, embedding, and vector store upsert.
 *
 * Uses @apidevtools/swagger-parser for validation and dereferencing,
 * and the yaml package for raw YAML parsing.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import SwaggerParser from "@apidevtools/swagger-parser";
import pino from "pino";
import type {
  ParsedEndpoint,
  EndpointParam,
  CodeExample,
  ErrorInfo,
} from "../types.js";

const log = pino({ name: "docscope:openapi-parser" });

// ─── Schema helpers ───

/**
 * Flatten an OpenAPI schema object into a type string for display.
 * Handles $ref (post-deref), arrays, objects, and primitives.
 */
function schemaToTypeString(schema: Record<string, unknown> | undefined | null): string {
  if (!schema) return "unknown";
  if (schema.type === "array" && schema.items) {
    return `${schemaToTypeString(schema.items as Record<string, unknown>)}[]`;
  }
  if (schema.type === "object") return "object";
  if (typeof schema.type === "string") return schema.type;
  // oneOf / anyOf — take the first option
  const union = (schema.oneOf ?? schema.anyOf) as Record<string, unknown>[] | undefined;
  if (union && Array.isArray(union) && union.length > 0) {
    return union.map(schemaToTypeString).join(" | ");
  }
  return "unknown";
}

/**
 * Extract a JSON-serialisable subset of a schema, stripping internal noise.
 * Returns null if the schema is empty or undefined.
 */
function extractSchema(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  // Return the raw schema object — it has already been dereferenced by swagger-parser
  return schema as Record<string, unknown>;
}

// ─── Parameter extraction ───

function extractParameters(
  params: unknown[] | undefined,
): EndpointParam[] {
  if (!params || !Array.isArray(params)) return [];

  return params
    .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
    .map((p) => ({
      name: String(p.name ?? ""),
      type: schemaToTypeString(p.schema as Record<string, unknown> | undefined),
      required: Boolean(p.required),
      description: String(p.description ?? ""),
      location: mapParamLocation(String(p.in ?? "query")),
    }));
}

function mapParamLocation(loc: string): EndpointParam["location"] {
  switch (loc) {
    case "path":
      return "path";
    case "query":
      return "query";
    case "header":
      return "header";
    case "cookie":
      return "header"; // treat cookies as header-level
    default:
      return "query";
  }
}

// ─── Request body extraction ───

function extractRequestBody(
  requestBody: unknown,
): { schema: Record<string, unknown> | null; params: EndpointParam[] } {
  if (!requestBody || typeof requestBody !== "object") {
    return { schema: null, params: [] };
  }

  const rb = requestBody as Record<string, unknown>;
  const content = rb.content as Record<string, unknown> | undefined;
  if (!content) return { schema: null, params: [] };

  // Prefer application/json, fall back to first content type
  const mediaType =
    (content["application/json"] as Record<string, unknown>) ??
    (content["application/x-www-form-urlencoded"] as Record<string, unknown>) ??
    (Object.values(content)[0] as Record<string, unknown> | undefined);

  if (!mediaType) return { schema: null, params: [] };

  const schema = extractSchema(mediaType.schema);
  const params: EndpointParam[] = [];

  // Extract top-level properties as body params
  if (schema && schema.properties && typeof schema.properties === "object") {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const [name, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      const prop = propSchema as Record<string, unknown>;
      params.push({
        name,
        type: schemaToTypeString(prop),
        required: required.includes(name),
        description: String(prop.description ?? ""),
        location: "body",
      });
    }
  }

  return { schema, params };
}

// ─── Response schema extraction ───

function extractResponseSchema(
  responses: unknown,
): Record<string, unknown> | null {
  if (!responses || typeof responses !== "object") return null;

  const resp = responses as Record<string, unknown>;

  // Look for 200, 201, or the first 2xx response
  const successKey = ["200", "201"].find((k) => resp[k]) ??
    Object.keys(resp).find((k) => k.startsWith("2"));

  if (!successKey || !resp[successKey]) return null;

  const successResp = resp[successKey] as Record<string, unknown>;
  const content = successResp.content as Record<string, unknown> | undefined;
  if (!content) return null;

  const mediaType =
    (content["application/json"] as Record<string, unknown>) ??
    (Object.values(content)[0] as Record<string, unknown> | undefined);

  if (!mediaType) return null;
  return extractSchema(mediaType.schema);
}

// ─── Error response extraction ───

function extractErrorResponses(
  responses: unknown,
  path: string,
  method: string,
): ErrorInfo[] {
  if (!responses || typeof responses !== "object") return [];

  const resp = responses as Record<string, unknown>;
  const errors: ErrorInfo[] = [];

  for (const [statusCode, responseObj] of Object.entries(resp)) {
    const status = parseInt(statusCode, 10);
    if (isNaN(status) || status < 400) continue;

    const response = responseObj as Record<string, unknown>;
    const description = String(response.description ?? "");

    errors.push({
      code: `${method.toUpperCase()}_${path.replace(/[^a-zA-Z0-9]/g, "_")}_${status}`,
      httpStatus: status,
      type: statusCode.startsWith("4") ? "client_error" : "server_error",
      message: description,
      commonCauses: inferCommonCauses(status),
      resolution: inferResolution(status),
      relatedEndpoints: [`${method.toUpperCase()} ${path}`],
    });
  }

  return errors;
}

function inferCommonCauses(status: number): string[] {
  switch (status) {
    case 400:
      return ["Invalid request parameters", "Malformed request body", "Missing required fields"];
    case 401:
      return ["Missing API key", "Expired authentication token", "Invalid credentials"];
    case 403:
      return ["Insufficient permissions", "API key lacks required scope", "Account restriction"];
    case 404:
      return ["Resource not found", "Invalid resource ID", "Deleted resource"];
    case 409:
      return ["Resource already exists", "Conflicting update", "Idempotency key conflict"];
    case 422:
      return ["Semantically invalid data", "Business rule violation"];
    case 429:
      return ["Rate limit exceeded", "Too many concurrent requests"];
    default:
      if (status >= 500) return ["Internal server error", "Service temporarily unavailable"];
      return ["See API documentation for details"];
  }
}

function inferResolution(status: number): string[] {
  switch (status) {
    case 400:
      return ["Check request body against the schema", "Verify all required fields are present"];
    case 401:
      return ["Verify your API key is correct", "Generate a new API key if expired"];
    case 403:
      return ["Check your API key permissions", "Contact support for account restrictions"];
    case 404:
      return ["Verify the resource ID exists", "Check the endpoint path"];
    case 409:
      return ["Use a unique idempotency key", "Fetch current state before updating"];
    case 422:
      return ["Validate input data against business rules", "Check field constraints"];
    case 429:
      return ["Implement exponential backoff", "Reduce request rate", "Contact support for limit increase"];
    default:
      if (status >= 500) return ["Retry with exponential backoff", "Check API status page"];
      return ["Consult the API documentation"];
  }
}

// ─── Code example generation ───

function generateCurlExample(
  path: string,
  method: string,
  baseUrl: string,
  params: EndpointParam[],
  hasRequestBody: boolean,
): CodeExample {
  const url = `${baseUrl}${path}`;
  const parts: string[] = [`curl -X ${method.toUpperCase()}`];

  parts.push(`  "${url}"`);
  parts.push(`  -H "Authorization: Bearer $API_KEY"`);

  if (hasRequestBody) {
    parts.push(`  -H "Content-Type: application/json"`);

    // Build a sample body from body params
    const bodyParams = params.filter((p) => p.location === "body");
    if (bodyParams.length > 0) {
      const sampleBody: Record<string, string> = {};
      for (const p of bodyParams.slice(0, 5)) {
        sampleBody[p.name] = `<${p.type}>`;
      }
      parts.push(`  -d '${JSON.stringify(sampleBody)}'`);
    }
  }

  return {
    language: "bash",
    label: "cURL",
    code: parts.join(" \\\n"),
  };
}

// ─── Raw text builder ───

/**
 * Convert a JSON Schema object into human-readable text for embedding.
 * Avoids raw JSON — instead lists properties with types and descriptions.
 * Handles circular refs by tracking visited objects.
 */
function schemaToReadableText(
  schema: Record<string, unknown>,
  indent = "",
  visited = new WeakSet<object>(),
  depth = 0,
): string {
  if (depth > 4 || !schema || typeof schema !== "object") return "";
  if (visited.has(schema)) return `${indent}(circular reference)`;
  visited.add(schema);

  const parts: string[] = [];
  const desc = schema.description as string | undefined;
  const type = schema.type as string | undefined;

  if (desc) parts.push(`${indent}${desc}`);

  // Object with properties
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (props) {
    const required = new Set((schema.required as string[]) ?? []);
    for (const [name, prop] of Object.entries(props)) {
      if (!prop || typeof prop !== "object") continue;
      const pType = (prop.type as string) ?? "any";
      const pDesc = (prop.description as string) ?? "";
      const req = required.has(name) ? " (required)" : "";
      const shortDesc = pDesc.replace(/<[^>]*>/g, "").slice(0, 150);
      parts.push(`${indent}- ${name} [${pType}]${req}: ${shortDesc}`);
    }
  }

  // Array items
  const items = schema.items as Record<string, unknown> | undefined;
  if (items && typeof items === "object") {
    parts.push(`${indent}Array of:`);
    parts.push(schemaToReadableText(items, indent + "  ", visited, depth + 1));
  }

  // anyOf / oneOf
  for (const key of ["anyOf", "oneOf"] as const) {
    const variants = schema[key] as Record<string, unknown>[] | undefined;
    if (Array.isArray(variants)) {
      const typeNames = variants
        .map((v) => (v.title as string) ?? (v.type as string) ?? "variant")
        .slice(0, 5);
      parts.push(`${indent}One of: ${typeNames.join(", ")}`);
    }
  }

  return parts.join("\n");
}

function buildRawText(
  endpoint: Omit<ParsedEndpoint, "rawText">,
): string {
  const parts: string[] = [];

  parts.push(`${endpoint.method.toUpperCase()} ${endpoint.path}`);

  if (endpoint.summary) parts.push(`Summary: ${endpoint.summary}`);
  if (endpoint.description) parts.push(`Description: ${endpoint.description}`);

  if (endpoint.parameters.length > 0) {
    parts.push("Parameters:");
    for (const p of endpoint.parameters) {
      const req = p.required ? "(required)" : "(optional)";
      parts.push(`  - ${p.name} [${p.type}] ${req} (${p.location}): ${p.description}`);
    }
  }

  if (endpoint.requestBody) {
    parts.push("Request Body:");
    parts.push(schemaToReadableText(endpoint.requestBody, "  "));
  }

  if (endpoint.responseSchema) {
    parts.push("Response:");
    parts.push(schemaToReadableText(endpoint.responseSchema, "  "));
  }

  if (endpoint.errorCodes.length > 0) {
    parts.push("Error Codes:");
    for (const err of endpoint.errorCodes) {
      parts.push(`  - ${err.code} (HTTP ${err.httpStatus}): ${err.message}`);
    }
  }

  return parts.join("\n");
}

// ─── Main parser ───

/**
 * Parse an OpenAPI YAML/JSON spec file into ParsedEndpoint[].
 *
 * - Validates and dereferences the spec using swagger-parser
 * - Handles OpenAPI 3.0 and 3.1
 * - Logs and skips individual endpoint errors without crashing
 */
export async function parseOpenApiSpec(
  filePath: string,
  apiName: string,
  baseUrl: string,
): Promise<ParsedEndpoint[]> {
  log.info({ filePath, apiName, baseUrl }, "Parsing OpenAPI spec");

  // Validate and dereference the spec (resolves all $ref pointers)
  let api: Record<string, unknown>;
  try {
    api = (await SwaggerParser.dereference(filePath)) as Record<string, unknown>;
  } catch (err) {
    log.error({ err, filePath }, "Failed to parse/validate OpenAPI spec");
    throw new Error(`Failed to parse OpenAPI spec at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const specVersion = String(api.openapi ?? api.swagger ?? "unknown");
  log.info({ specVersion }, "Spec validated successfully");

  const paths = api.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) {
    log.warn({ filePath }, "No paths found in spec");
    return [];
  }

  const endpoints: ParsedEndpoint[] = [];
  const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of httpMethods) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      try {
        const endpoint = parseOperation(path, method, operation, baseUrl);
        endpoints.push(endpoint);
      } catch (err) {
        const msg = `Error parsing ${method.toUpperCase()} ${path}: ${err instanceof Error ? err.message : String(err)}`;
        log.warn({ err, path, method }, msg);
        // Continue processing other endpoints
      }
    }
  }

  log.info(
    { apiName, endpointsFound: endpoints.length },
    "OpenAPI spec parsing complete",
  );

  return endpoints;
}

/**
 * Parse a single path+method operation into a ParsedEndpoint.
 */
function parseOperation(
  path: string,
  method: string,
  operation: Record<string, unknown>,
  baseUrl: string,
): ParsedEndpoint {
  const summary = String(operation.summary ?? "");
  const description = String(operation.description ?? "");

  // Collect parameters from operation-level
  const pathParams = extractParameters(operation.parameters as unknown[] | undefined);

  // Extract request body schema and body params
  const { schema: requestBody, params: bodyParams } = extractRequestBody(
    operation.requestBody,
  );

  const parameters = [...pathParams, ...bodyParams];

  // Extract response schema (200/201)
  const responseSchema = extractResponseSchema(operation.responses);

  // Extract error responses
  const errorCodes = extractErrorResponses(operation.responses, path, method);

  // Generate code examples
  const examples: CodeExample[] = [
    generateCurlExample(path, method, baseUrl, parameters, requestBody !== null),
  ];

  const endpointData = {
    path,
    method: method.toUpperCase(),
    summary,
    description,
    parameters,
    requestBody,
    responseSchema,
    examples,
    errorCodes,
  };

  return {
    ...endpointData,
    rawText: buildRawText(endpointData),
  };
}

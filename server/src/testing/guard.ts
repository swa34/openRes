/**
 * DocScope API Test Engine — SSRF Guard
 *
 * Validates target URLs before any request is made.
 * Prevents SSRF by enforcing HTTPS, allowlisted hosts,
 * and blocking private/reserved IP ranges.
 */

import { resolve as dnsResolve } from "node:dns/promises";
import { ALLOWED_APIS } from "../types.js";

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

/** IPv4 ranges that must never be reachable */
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // loopback
  /^0\./, // 0.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // link-local
];

/** IPv6 addresses that must never be reachable */
const PRIVATE_IPV6 = new Set(["::1", "::0", "0:0:0:0:0:0:0:1", "0:0:0:0:0:0:0:0"]);

function isPrivateIp(ip: string): boolean {
  // IPv6 check
  if (ip.includes(":")) {
    // Normalize compressed IPv6
    const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();
    if (PRIVATE_IPV6.has(normalized)) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1)
    const v4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) return isPrivateIp(v4Mapped[1]);
    // fe80:: link-local
    if (normalized.startsWith("fe80:")) return true;
    // fc00::/7 unique local
    if (/^f[cd]/.test(normalized)) return true;
    return false;
  }

  // IPv4 check
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(ip));
}

/**
 * Validate that a target URL is safe to fetch.
 *
 * Checks performed (in order):
 * 1. URL is well-formed
 * 2. Protocol is HTTPS only
 * 3. Host is not a private/reserved IP literal
 * 4. Host matches the allowlisted baseUrl for the specified API
 * 5. DNS resolution does not point to a private IP (anti-rebinding)
 */
export async function validateTargetUrl(
  url: string,
  apiName: string,
): Promise<GuardResult> {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "Malformed URL" };
  }

  // 2. HTTPS only
  if (parsed.protocol !== "https:") {
    return {
      allowed: false,
      reason: `Only HTTPS is allowed — got "${parsed.protocol.replace(":", "")}"`,
    };
  }

  // 3. Block IP literals that are private
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    isPrivateIp(hostname)
  ) {
    return {
      allowed: false,
      reason: "Requests to private/localhost addresses are blocked",
    };
  }

  // 4. Host must match the allowed baseUrl for this API
  const apiConfig = ALLOWED_APIS.find((a) => a.name === apiName);
  if (!apiConfig) {
    return { allowed: false, reason: `Unknown API "${apiName}"` };
  }

  const allowedHost = new URL(apiConfig.baseUrl).hostname;
  if (parsed.hostname !== allowedHost) {
    return {
      allowed: false,
      reason: `Host "${parsed.hostname}" is not allowed for API "${apiName}" — expected "${allowedHost}"`,
    };
  }

  // 5. DNS rebinding check — resolve the hostname and verify no private IPs
  try {
    const addresses = await dnsResolve(hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return {
          allowed: false,
          reason: `DNS for "${hostname}" resolved to private IP ${addr} — possible DNS rebinding`,
        };
      }
    }
  } catch {
    return {
      allowed: false,
      reason: `DNS resolution failed for "${hostname}"`,
    };
  }

  return { allowed: true, reason: "URL passed all safety checks" };
}

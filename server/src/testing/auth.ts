/**
 * DocScope API Test Engine — Authentication
 *
 * Builds auth headers and validates API key formats.
 * Keys are used once per request and never stored or logged.
 */

import type { AllowedApi } from "../types.js";

export interface AuthValidation {
  valid: boolean;
  message: string;
}

/**
 * Construct the appropriate auth header for the target API.
 */
export function buildAuthHeader(
  apiKey: string,
  apiConfig: AllowedApi,
): Record<string, string> {
  switch (apiConfig.authType) {
    case "bearer":
      return { [apiConfig.authHeader]: `Bearer ${apiKey}` };

    case "api-key-header":
      return { [apiConfig.authHeader]: apiKey };

    case "basic": {
      // For Twilio, apiKey is "SID:AuthToken"
      const encoded = Buffer.from(apiKey).toString("base64");
      return { [apiConfig.authHeader]: `Basic ${encoded}` };
    }

    default: {
      const _exhaustive: never = apiConfig.authType;
      throw new Error(`Unknown auth type: ${_exhaustive}`);
    }
  }
}

/**
 * Basic format validation for API keys. Rejects obviously wrong keys
 * before we ever make a network request.
 */
export function validateApiKey(
  apiKey: string,
  apiName: string,
): AuthValidation {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { valid: false, message: "API key is empty or missing" };
  }

  switch (apiName) {
    case "stripe": {
      const stripePattern = /^(sk|rk)_(test|live)_.+$/;
      if (!stripePattern.test(apiKey)) {
        return {
          valid: false,
          message:
            'Stripe key must start with "sk_test_", "sk_live_", "rk_test_", or "rk_live_"',
        };
      }
      return { valid: true, message: "Stripe key format OK" };
    }

    case "twilio": {
      // Twilio expects "SID:AuthToken" for basic auth
      const parts = apiKey.split(":");
      if (parts.length !== 2) {
        return {
          valid: false,
          message:
            'Twilio credentials must be in "AccountSID:AuthToken" format',
        };
      }
      const sidPattern = /^AC[0-9a-f]{32}$/;
      if (!sidPattern.test(parts[0])) {
        return {
          valid: false,
          message:
            'Twilio Account SID must start with "AC" followed by 32 hex characters',
        };
      }
      if (parts[1].length === 0) {
        return { valid: false, message: "Twilio AuthToken is empty" };
      }
      return { valid: true, message: "Twilio credentials format OK" };
    }

    default:
      return {
        valid: false,
        message: `Unknown API "${apiName}" — cannot validate key format`,
      };
  }
}

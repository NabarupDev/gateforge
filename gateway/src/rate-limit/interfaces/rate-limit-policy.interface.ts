export interface RateLimitPolicy {
  /**
   * Maximum requests allowed within the window.
   */
  requests: number;

  /**
   * Window duration in seconds.
   */
  window: number;

  /**
   * Optional human-readable policy name (e.g. 'anonymous', 'jwt', 'api-key', 'admin').
   */
  name?: string;

  /**
   * If true, this policy bypasses rate limiting checks entirely (e.g., admin role).
   */
  unlimited?: boolean;
}

export interface RateLimitResult {
  /**
   * Whether the request is permitted.
   */
  allowed: boolean;

  /**
   * Total limit configured for the policy.
   */
  limit: number;

  /**
   * Remaining quota in the current window.
   */
  remaining: number;

  /**
   * Unix timestamp (in seconds) when the oldest entry in the window expires/resets.
   */
  reset: number;

  /**
   * Seconds until the client should retry (provided when allowed = false).
   */
  retryAfter?: number;
}

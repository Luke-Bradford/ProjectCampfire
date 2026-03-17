/**
 * Shared Giphy validation constants.
 * Imported by both the /api/gif route handler and the tRPC feed router.
 *
 * Giphy .gif CDN URLs follow the pattern:
 *   https://media{N}.giphy.com/media/<path-encoded-id>/<filename>.gif
 * All parameters are path-encoded; no query strings on .gif format URLs.
 */
export const GIPHY_URL_RE =
  /^https:\/\/media\d*\.giphy\.com\/media\/[^/]+\/[^/]+\.gif$/;

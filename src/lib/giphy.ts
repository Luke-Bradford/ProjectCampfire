/**
 * Shared Giphy validation constants.
 * Imported by both the /api/gif route handler and the tRPC feed router.
 *
 * Giphy .gif CDN URLs follow the pattern:
 *   https://media{N}.giphy.com/media/<context-id>/<media-id>/<filename>.gif
 * The path has multiple segments (context + media ID + filename) so we match
 * /media/ prefix + any path ending in .gif rather than constraining segment count.
 */
export const GIPHY_URL_RE =
  /^https:\/\/media\d*\.giphy\.com\/media\/.+\.gif$/;

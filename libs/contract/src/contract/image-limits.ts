export const imageLimits = {
  count: 4,

  // 5 MB keeps the base64 form under the Claude API's 10 MB per-image limit.
  bytes: 5 * 1024 * 1024,
  longEdge: 1568,
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
} as const;

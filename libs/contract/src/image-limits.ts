// What a message's images may be. The model takes these 4 types, and the client scales each image
// so its long edge fits the model's standard resolution before it sends it, so the server keeps
// only the scaled copy. 5 MB keeps the base64 form under the Claude API's 10 MB per-image limit.
export const imageLimits = {
  count: 4,
  bytes: 5 * 1024 * 1024,
  longEdge: 1568,
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
} as const;

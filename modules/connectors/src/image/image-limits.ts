export const imageLimits = {
  // a stored PNG, so any stored image can be a source or a reference
  maxStoredBytes: 8 * 1024 * 1024,

  // the long side an imported picture is scaled down to
  importLongEdge: 2048,
  maxReferences: 4,
  maxPromptLength: 4000,
  drawTimeoutMs: 120_000,

  // a decode of more pixels than this refuses before it allocates
  maxPixels: 25_000_000,
} as const;

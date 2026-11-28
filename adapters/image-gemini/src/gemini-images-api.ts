// Gemini's image API: the base URL its calls go to, and the header the key goes in.
export const geminiImagesAPI = {
  url: 'https://generativelanguage.googleapis.com/v1beta',
  placement: { header: 'x-goog-api-key' },
} as const;

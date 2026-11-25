// The API of each image provider, fixed in its adapter: the base URL its calls go to and where the
// key goes. The credential may reach only the URL's origin.
export const imageProviderAPI = {
  openai: { url: 'https://api.openai.com/v1', placement: undefined },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta',
    placement: { header: 'x-goog-api-key' },
  },
} as const;

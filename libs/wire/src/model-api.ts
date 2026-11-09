export const modelAPIs = ['anthropic-messages', 'openai-responses'] as const;

export type ModelAPI = (typeof modelAPIs)[number];

export type ModelAPIEndpointName = 'messages' | 'count_tokens' | 'responses' | 'models';

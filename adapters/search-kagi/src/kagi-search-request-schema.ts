import { z } from 'zod';

// The parts of Kagi's v1 Search API (https://kagi.com/api/docs/openapi/search) that nixie sends
// and reads.

const kagiFreshnessSchema = z.enum(['day', 'week', 'month']);

const kagiLensSchema = z.object({
  sites_included: z.array(z.string()).optional(),
  time_relative: kagiFreshnessSchema.optional(),
});

export const kagiSearchRequestSchema = z.object({
  query: z.string().min(1),
  workflow: z.literal('search'),
  limit: z.int().min(1).max(1024),
  lens: kagiLensSchema.optional(),
});

export type KagiSearchRequest = z.infer<typeof kagiSearchRequestSchema>;

const kagiSearchResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string().optional(),
  time: z.string().optional(),
});

export type KagiSearchResult = z.input<typeof kagiSearchResultSchema>;

const kagiSearchDataSchema = z.object({
  search: z.array(kagiSearchResultSchema).default([]),
});

export const kagiSearchResponseSchema = z.object({ data: kagiSearchDataSchema });

export type KagiSearchResponse = z.input<typeof kagiSearchResponseSchema>;

const kagiErrorDetailSchema = z.object({ code: z.string(), message: z.string().nullish() });

export const kagiErrorSchema = z.object({ error: z.array(kagiErrorDetailSchema) });

export type KagiError = z.input<typeof kagiErrorSchema>;

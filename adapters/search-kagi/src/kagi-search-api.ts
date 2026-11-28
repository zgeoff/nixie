// Kagi's search API: the base URL a search goes to, the label of its key in nixie's credential
// list, and what one search costs, in millionths of a dollar. Kagi's price list charges $12 for
// 1000 searches (https://kagi.com/api/pricing).
export const kagiSearchAPI = {
  url: 'https://kagi.com/api/v1',
  label: 'Kagi',
  priceMicros: 12_000,
} as const;

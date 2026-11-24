// The local target starts nixie with no encoder, so memory search runs on keywords alone. In an
// index of 1 or 2 items, BM25 weighs every word at about 0, so the shipped keyword floor of
// per-turn retrieval drops every match, and a call's related lookup finds nothing.
export const localMemoryConfig: Readonly<Record<string, number>> = { trigger_min_score: 0 };

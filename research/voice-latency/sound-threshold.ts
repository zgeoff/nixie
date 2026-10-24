// Below this level a sample counts as silence. GPT-Live's silent stream peaks near 0.001, and speech
// from every candidate runs well above it.
export const soundThreshold = 0.01;

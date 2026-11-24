// Expects at least one request that the scripted model received to hold the text.
export function pickModelRefusal(requests: number, text: string): string | null {
  return requests === 0 ? `no request of the model held the text: ${text}` : null;
}

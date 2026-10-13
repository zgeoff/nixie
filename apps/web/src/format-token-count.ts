// Formats a token count short: 850, 3.2k under ten thousand, 41k from there, and 1.2M from a
// million on.
export function formatTokenCount(tokens: number): string {
  const thousands = Math.round(tokens / 1000);

  if (tokens < 1000) {
    return `${tokens}`;
  }
  if (tokens < 10_000) {
    return `${formatOneDecimal(tokens / 1000)}k`;
  }
  return thousands < 1000 ? `${thousands}k` : `${formatOneDecimal(tokens / 1_000_000)}M`;
}

// one decimal place, and none when it is zero
function formatOneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/u, '');
}

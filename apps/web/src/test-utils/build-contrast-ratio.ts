export function buildContrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(getLuminance(foreground), getLuminance(background));
  const darker = Math.min(getLuminance(foreground), getLuminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

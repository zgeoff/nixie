const namedColours: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  gray: '#808080',
  red: '#ff0000',
  orange: '#ffa500',
  yellow: '#ffff00',
  green: '#008000',
  teal: '#008080',
  blue: '#0000ff',
  navy: '#000080',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
};

// The text colour with the higher WCAG contrast ratio on a region's background. A region with no
// background is on the screen's black.
export function pickRegionTextColour(background: string | null): 'black' | 'white' {
  const hex = background === null ? '#000000' : (namedColours[background] ?? background);

  const luminance =
    0.2126 * toLinearChannel(hex.slice(1, 3)) +
    0.7152 * toLinearChannel(hex.slice(3, 5)) +
    0.0722 * toLinearChannel(hex.slice(5, 7));

  const onBlack = (luminance + 0.05) / 0.05;
  const onWhite = 1.05 / (luminance + 0.05);

  return onBlack > onWhite ? 'black' : 'white';
}

// One sRGB channel, as two hex digits, in linear light.
function toLinearChannel(digits: string): number {
  const channel = Number.parseInt(digits, 16) / 255;

  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

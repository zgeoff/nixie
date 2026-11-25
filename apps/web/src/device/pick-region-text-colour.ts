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

// The text colour that reads on a region's background: black on a light one, white on a dark one.
// A region with no background is on the screen's black.
export function pickRegionTextColour(background: string | null): 'black' | 'white' {
  const hex = background === null ? '#000000' : (namedColours[background] ?? background);
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.55 ? 'black' : 'white';
}

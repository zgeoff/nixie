// an IPv4 or IPv6 address with an optional prefix length. It spells out both cases of each hex digit
// instead of the i flag, because the published config schema copies the pattern and drops flags.
export const rangePattern =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[\da-fA-F:]*:[\da-fA-F:.]*(?:\/\d{1,3})?)$/u;

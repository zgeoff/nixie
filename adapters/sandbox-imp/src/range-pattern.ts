// The pattern spells out both cases of each hex digit instead of the i flag, because the published
// config schema copies the pattern and drops its flags.
export const rangePattern =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[\da-fA-F:]*:[\da-fA-F:.]*(?:\/\d{1,3})?)$/u;

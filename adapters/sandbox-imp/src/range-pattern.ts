// an IPv4 or IPv6 address with an optional prefix length
export const rangePattern =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[\da-f:]*:[\da-f:.]*(?:\/\d{1,3})?)$/iu;

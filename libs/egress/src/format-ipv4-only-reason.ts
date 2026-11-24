// The refusal for a host with no IPv4 address, in the words the model reads.
export function formatIPv4OnlyReason(host: string): string {
  return `${host} has no IPv4 address, and nixie reaches IPv4 hosts only`;
}

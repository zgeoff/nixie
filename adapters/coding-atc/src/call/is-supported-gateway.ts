const gatewayPattern = /^atc-gateway\/(?<major>\d+)\.(?<minor>\d+)\.\d+/u;

// The release pairs that the design lists: every gateway from 7.12.0 on in major 7 serves service
// tokens and each tool the adapter calls.
export function isSupportedGateway(version: string | undefined): boolean {
  const groups = gatewayPattern.exec(version ?? '')?.groups;

  if (groups === undefined) {
    return false;
  }

  return Number(groups['major']) === 7 && Number(groups['minor']) >= 12;
}

import type { HopScan } from './gate-page-hops';
import type { PageFetch } from './page-fetch';
import { refuseBlockedPlace } from './refuse-blocked-place';
import { secretRefusalEvent } from './refuse-fetch-url';
import type { SecretScan } from './secret-scan';

// The scan of each redirect hop, for the hop gate.
export function makeHopScan(
  scan: SecretScan,
  fetching: Pick<PageFetch, 'findBlockedPlace'> = {},
): HopScan {
  return async (hop) => {
    const blocked = await refuseBlockedPlace(fetching, hop.url);

    if (blocked !== null) {
      return {
        kind: 'refuse',
        reason: `${nameSender(scan, hop.sentBy)} redirected to a site: ${blocked}`,
      };
    }

    const found = scan.findSecret(hop.url);

    if (found === null) {
      return { kind: 'pass' };
    }

    const isExempt = await scan.isExempt(hop.number);

    if (isExempt) {
      return { kind: 'pass' };
    }

    scan.logger(secretRefusalEvent, { rule: found.rule, hop: hop.number });

    return {
      kind: 'refuse',
      reason: `${nameSender(scan, hop.sentBy)} redirected to a URL that holds a secret (rule ${found.rule}), so it was not fetched`,
    };
  };
}

// a host that holds a secret itself would put it in the sentence, so the sentence leaves it out
function nameSender(scan: SecretScan, sentBy: string): string {
  return scan.findSecret(sentBy) === null ? sentBy : 'a site';
}

import type { HopScan } from './gate-page-hops';
import { secretRefusalEvent } from './refuse-fetch-url';
import type { SecretScan } from './secret-scan';

// The scan of each redirect hop, for the hop gate.
export function makeHopScan(scan: SecretScan): HopScan {
  return async (hop) => {
    const found = scan.findSecret(hop.url);

    if (found === null) {
      return { kind: 'pass' };
    }

    const isExempt = await scan.isExempt(hop.number);

    if (isExempt) {
      return { kind: 'pass' };
    }

    scan.logger(secretRefusalEvent, { rule: found.rule, hop: hop.number });

    // a host that holds a secret itself would put it in the sentence, so the sentence leaves it out
    const sender = scan.findSecret(hop.sentBy) === null ? hop.sentBy : 'a site';

    return {
      kind: 'refuse',
      reason: `${sender} redirected to a URL that holds a secret (rule ${found.rule}), so it was not fetched`,
    };
  };
}

import { findPlace } from './find-place';
import { rankTrust } from './rank-trust';
import type { DestinationText, PlaceEntry, Trust } from './types';

export type NarrowRequest =
  | { readonly kind: 'lower'; readonly trust: Exclude<Trust, 'self'> }
  | { readonly kind: 'remove' };

export type NarrowRefusal =
  | 'not_found'
  | 'not_lower'
  | 'blocked_remove'
  | 'self_entry'
  | 'raises_destination';

export type NarrowPlan =
  | { readonly status: 'ok' }
  | { readonly status: 'refused'; readonly reason: NarrowRefusal };

// Decides whether an entry may be lowered or removed. Beyond a level that is not lower and the
// remove of a blocked entry, it refuses a change that leaves any destination the entry covers at a
// higher level than before, which another entry can cause.
export function planPlacesNarrow(
  entries: readonly PlaceEntry[],
  placeID: string,
  request: NarrowRequest,
): NarrowPlan {
  const target = entries.find((entry) => entry.placeID === placeID);

  if (target === undefined) {
    return { status: 'refused', reason: 'not_found' };
  }

  if (target.trust === 'self') {
    return { status: 'refused', reason: 'self_entry' };
  }

  if (request.kind === 'remove' && target.trust === 'blocked') {
    return { status: 'refused', reason: 'blocked_remove' };
  }

  const after =
    request.kind === 'remove'
      ? entries.filter((entry) => entry.placeID !== placeID)
      : entries.map((entry) =>
          entry.placeID === placeID ? { ...entry, trust: request.trust } : entry,
        );

  if (request.kind === 'lower' && rankTrust(request.trust) >= rankTrust(target.trust)) {
    return { status: 'refused', reason: 'not_lower' };
  }

  const sampleLabel = pickSampleLabel(entries);

  const isRaised = collectSamples(entries, target, sampleLabel)
    .map((sample) => unmaskSample(sample, sampleLabel))
    .some((sample) => rankTrust(readLevel(after, sample)) > rankTrust(readLevel(entries, sample)));

  return isRaised ? { status: 'refused', reason: 'raises_destination' } : { status: 'ok' };
}

// A label that no entry names, so no entry sits on a sample and masks it.
function pickSampleLabel(entries: readonly PlaceEntry[]): string {
  const held = JSON.stringify(entries.map((entry) => entry.key));
  let label = 'nixie-sample';

  while (held.includes(label)) {
    label += 'x';
  }

  return label;
}

// The destinations the entry covers, as far as the other entries tell them apart: its own place, a
// subdomain nothing else names, and each place another entry names inside it.
function collectSamples(
  entries: readonly PlaceEntry[],
  target: PlaceEntry,
  sampleLabel: string,
): DestinationText[] {
  const key = target.key;

  if (key.kind === 'site') {
    const domains = [
      key.domain,
      ...(key.subdomains ? [`${sampleLabel}.${key.domain}`] : []),
      ...entries.flatMap((entry) =>
        entry.key.kind === 'site' && isInside(entry.key.domain, key.domain, key.subdomains)
          ? [entry.key.domain]
          : [],
      ),
    ];

    return domains.map((domain) => ({ parsed: { kind: 'site', domain }, raw: domain }));
  }

  if (key.kind === 'mail_domain') {
    const domains = [
      key.domain,
      ...(key.subdomains ? [`${sampleLabel}.${key.domain}`] : []),
      ...entries.flatMap((entry) =>
        entry.key.kind === 'mail_domain' && isInside(entry.key.domain, key.domain, key.subdomains)
          ? [entry.key.domain]
          : [],
      ),
    ];

    const addressDomains = entries.flatMap((entry) =>
      entry.key.kind === 'address' &&
      isInside(toMailDomain(entry.key.address), key.domain, key.subdomains)
        ? [toMailDomain(entry.key.address)]
        : [],
    );

    return [...domains, ...addressDomains].map((domain) => {
      const address = `${sampleLabel}@${domain}`;

      return { parsed: { kind: 'address', address }, raw: address };
    });
  }

  if (key.kind === 'address') {
    return [{ parsed: { kind: 'address', address: key.address }, raw: key.address }];
  }

  if (key.kind === 'phone') {
    return [{ parsed: { kind: 'phone', e164: key.e164 }, raw: key.e164 }];
  }

  if (key.kind === 'handle') {
    return [
      {
        parsed: { kind: 'handle', channel: key.channel, id: key.id },
        raw: `${key.channel}:${key.id}`,
      },
    ];
  }

  return [{ parsed: null, raw: key.value }];
}

function isInside(domain: string, parent: string, hasSubdomains: boolean): boolean {
  return domain === parent || (hasSubdomains && domain.endsWith(`.${parent}`));
}

function toMailDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}

// A parsed sample keeps no raw string an entry could equal, so a blocked raw entry such as a
// contact never masks it. A sample with no parsed form is a raw key itself and keeps its raw.
function unmaskSample(sample: DestinationText, sampleLabel: string): DestinationText {
  return sample.parsed === null
    ? sample
    : { parsed: sample.parsed, raw: `${sampleLabel}:${sample.raw}` };
}

function readLevel(entries: readonly PlaceEntry[], sample: DestinationText): Trust | null {
  return findPlace(entries, sample)?.trust ?? null;
}

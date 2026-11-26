import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

export interface ApprovalPackageProps {
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly unpackedBytes: number | null;
    readonly publisher: string;
    readonly description: string;
    readonly integrity: string;
  };
}

const block = css({
  borderColor: 'border',
  borderWidth: '1px',
  display: 'grid',
  gap: '1',
  maxWidth: '640px',
  padding: '3',
});

const gap = css({ color: 'textMuted', fontSize: 'sm' });
const hash = css({ fontFamily: 'mono', fontSize: 'xs', overflowWrap: 'anywhere' });

// The package that an install asks to approve: what the registry names, who published it, how big
// it is and the hash the install checks. The description is the publisher's own words, so the card
// says so and shows them as a quote.
export function ApprovalPackage(props: ApprovalPackageProps): ReactNode {
  const item = props.package;

  return (
    <div aria-label="Package" className={block} role="group">
      <p className={css({ fontWeight: 'semibold' })}>
        {item.name} {item.version}
      </p>
      <p className={gap}>Published by {item.publisher}</p>
      <p className={gap}>
        {item.unpackedBytes === null
          ? 'The registry gives no size'
          : `Unpacks to ${formatBytes(item.unpackedBytes)}`}
      </p>
      {item.description === '' ? null : (
        <p className={gap}>
          The publisher's words: <q>{item.description}</q>
        </p>
      )}
      <p className={hash}>{item.integrity}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

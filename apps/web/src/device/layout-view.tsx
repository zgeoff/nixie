import type { RegionContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { ReplyText } from '../components/reply-text';
import { css } from '../styled-system/css';
import { DeviceImage } from './device-image';
import { LiveValue } from './live-value';
import type { DeviceLayout } from './use-device-events';

export interface LayoutViewProps {
  readonly layout: NonNullable<DeviceLayout>;
}

const grid = css({
  backgroundColor: 'black',
  color: 'white',
  display: 'grid',
  height: '100dvh',
  overflow: 'hidden',
  width: '100vw',
});

const cell = css({ minHeight: '0', minWidth: '0', overflow: 'hidden', position: 'relative' });

// The regions of a layout in their grid, on black. A region is keyed by its name, so an update to
// one region leaves the others as they are, and a blank region draws nothing.
export function LayoutView(props: LayoutViewProps): ReactNode {
  const layout = props.layout;

  return (
    <div
      className={grid}
      data-testid="layout"
      style={{
        gridTemplateColumns: layout.columns.map(toTrack).join(' '),
        gridTemplateRows: layout.rows.map(toTrack).join(' '),
      }}
    >
      {layout.regions.map((region) => (
        <div
          className={cell}
          data-region={region.name}
          key={region.name}
          style={{
            gridColumn: `${String(region.column)} / span ${String(region.columnSpan)}`,
            gridRow: `${String(region.row)} / span ${String(region.rowSpan)}`,
          }}
        >
          {region.content === null ? null : <RegionBody content={region.content} />}
        </div>
      ))}
    </div>
  );
}

// `2fr` as `minmax(0, 2fr)`, so a wide region never pushes the others out of the grid.
function toTrack(track: string): string {
  return `minmax(0, ${track})`;
}

interface RegionBodyProps {
  readonly content: RegionContent;
}

const text = css({ fontSize: '2xl', padding: '6' });

function RegionBody(props: RegionBodyProps): ReactNode {
  const content = props.content;

  if (content.kind === 'markdown') {
    return (
      <div className={text}>
        <ReplyText text={content.markdown} />
      </div>
    );
  }

  if (content.kind === 'image') {
    return <DeviceImage fit={content.fit} image={content.image} />;
  }

  return <LiveValue content={content} />;
}

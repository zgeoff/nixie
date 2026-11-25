import type { RegionContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { ReplyText } from '../components/reply-text';
import { css } from '../styled-system/css';
import { DeviceImage } from './device-image';
import { FitBox } from './fit-box';
import { LiveValue } from './live-value';
import { pickRegionTextColour } from './pick-region-text-colour';
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

// The regions of a layout in their grid, on black, each on its own background colour when it has
// one. Markdown and live values grow to fill their region. A region is keyed by its name, so an update to
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
            ...(region.background === null
              ? {}
              : {
                  backgroundColor: region.background,
                  color: pickRegionTextColour(region.background),
                }),
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

// the padding scales with the text, so a small region keeps room for its text
const text = css({ height: '100%' });
const padded = css({ padding: '0.25em' });

function RegionBody(props: RegionBodyProps): ReactNode {
  const content = props.content;

  if (content.kind === 'markdown') {
    return (
      <div className={text}>
        <FitBox fitKey={content.markdown} isCentred={false}>
          <div className={padded}>
            <ReplyText text={content.markdown} />
          </div>
        </FitBox>
      </div>
    );
  }

  if (content.kind === 'image') {
    return <DeviceImage fit={content.fit} image={content.image} />;
  }

  return <LiveValue content={content} />;
}

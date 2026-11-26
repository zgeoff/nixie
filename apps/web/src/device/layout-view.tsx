import type { RegionEventContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { ReplyText } from '../components/reply-text';
import { css } from '../styled-system/css';
import { DeviceImage } from './device-image';
import { FitBox } from './fit-box';
import { LiveValue } from './live-value';
import { PageRegion } from './page-region';
import { pickRegionTextColour } from './pick-region-text-colour';
import type { DeviceLayout, PageDataNotice, PageDelivery } from './types';
import { useReportRegionError } from './use-report-region-error';

export interface LayoutViewProps {
  readonly layout: NonNullable<DeviceLayout>;

  // each message that the assistant sent into a page since the stream opened
  readonly messages?: readonly PageDelivery[];
  readonly notices?: readonly PageDataNotice[];

  // called when a page's frame sees a touch, which its own window keeps from the device page
  readonly onTouch?: () => void;
}

const grid = css({
  backgroundColor: 'black',
  color: 'white',
  display: 'grid',
  height: '100%',
  overflow: 'hidden',
  width: '100%',
});

const cell = css({ minHeight: '0', minWidth: '0', overflow: 'hidden', position: 'relative' });

// The regions of a layout in their grid, on black, each on its own background colour when it has
// one. Markdown and live values grow to fill their region. A region is keyed by its name, so an update to
// one region leaves the others as they are, and a blank region draws nothing.
export function LayoutView(props: LayoutViewProps): ReactNode {
  const layout = props.layout;
  const report = useReportRegionError();

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
          {region.content === null ? null : (
            <RegionBody
              content={region.content}
              messages={props.messages ?? []}
              notices={props.notices ?? []}
              onTouch={props.onTouch}
              onFail={(message) => {
                if (region.shown !== null) {
                  report({ region: region.name, shown: region.shown, message });
                }
              }}
              region={region.name}
              shown={region.shown}
            />
          )}
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
  readonly content: RegionEventContent;
  readonly region: string;
  readonly shown: string | null;
  readonly messages: readonly PageDelivery[];
  readonly notices: readonly PageDataNotice[];
  readonly onFail: (message: string) => void;
  readonly onTouch: (() => void) | undefined;
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
    return <DeviceImage fit={content.fit} image={content.image} onFail={props.onFail} />;
  }

  if (content.kind === 'html') {
    return props.shown === null ? null : (
      <PageRegion
        frame={content.frame}
        key={`${props.shown}/${content.frame}`}
        messages={props.messages}
        notices={props.notices}
        onFail={props.onFail}
        onTouch={props.onTouch}
        region={props.region}
        shown={props.shown}
      />
    );
  }

  return <LiveValue content={content} />;
}

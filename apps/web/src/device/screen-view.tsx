import type { ScreenContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { ReplyText } from '../components/reply-text';
import { css } from '../styled-system/css';
import { DeviceImage } from './device-image';

export interface ScreenViewProps {
  readonly blocks: readonly ScreenContent[];
}

const screen = css({
  backgroundColor: 'black',
  color: 'white',
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  overflow: 'hidden',
  width: '100vw',
});

const text = css({ fontSize: '2xl', padding: '6' });
const picture = css({ flex: '1', minHeight: '0' });

// The blocks of a show or of an idle scene, top to bottom, on black. No block is a black screen.
export function ScreenView(props: ScreenViewProps): ReactNode {
  return (
    <div className={screen} data-testid="screen">
      {props.blocks.map((block, index) =>
        block.kind === 'markdown' ? (
          <div className={text} key={index}>
            <ReplyText text={block.text} />
          </div>
        ) : (
          <div className={picture} key={index}>
            <DeviceImage fit={block.fit} image={block.image} />
          </div>
        ),
      )}
    </div>
  );
}

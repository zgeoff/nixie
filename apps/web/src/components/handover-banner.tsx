import type { ReactNode } from 'react';
import { useHandoverAsk } from '../computer/use-handover-ask';
import { css } from '../styled-system/css';

const banner = css({
  alignItems: 'center',
  borderBlockEnd: '1px solid',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '3',
  justifyContent: 'space-between',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

export interface HandoverBannerProps {
  // takes the user to the computer, where the take-over starts
  readonly onTakeOver: () => void;
}

// While the assistant asks the user to take over the computer, every signed-in page shows what it
// needs and a Take over button. It goes when a take-over starts or the assistant closes the ask.
export function HandoverBanner(props: HandoverBannerProps): ReactNode {
  const ask = useHandoverAsk();

  if (ask === null) {
    return null;
  }

  return (
    <section aria-label="the assistant asks you to take over the computer" className={banner}>
      <p role="status">
        {ask.reason === null
          ? 'The assistant asks you to take over the computer.'
          : `The assistant asks you to take over the computer: ${ask.reason}`}
      </p>
      <button onClick={props.onTakeOver} type="button">
        Take over
      </button>
    </section>
  );
}

import type { ReactNode } from 'react';
import { match } from 'ts-pattern';
import { css } from '../styled-system/css';
import { useMicrophoneAccess } from '../use-microphone-access';

const control = css({ color: 'textMuted', fontSize: 'sm' });

const steps = css({
  listStyleType: 'decimal',
  marginBlock: '1',
  maxWidth: 'sm',
  paddingInlineStart: '5',
});

export function VoiceTypingControl(): ReactNode {
  const microphone = useMicrophoneAccess();

  return match(microphone.access)
    .with('checking', () => null)
    .with('not-asked', 'asking', (access) => (
      <button
        className={control}
        disabled={access === 'asking'}
        onClick={microphone.request}
        type="button"
      >
        {access === 'asking' ? 'Asking for the microphone…' : 'Turn on voice typing'}
      </button>
    ))
    .with('on', () => (
      <p className={control} role="status">
        Voice typing on
      </p>
    ))
    .with('blocked', () => (
      <details className={control}>
        <summary>Voice typing blocked</summary>
        <ol className={steps}>
          <li>
            In Chrome, tap the icon to the left of the address bar, then Permissions. In the
            installed app, long-press the nixie icon and tap Site settings.
          </li>
          <li>Set Microphone to Allow.</li>
          <li>
            If Chrome itself has no microphone access, allow it in Android Settings, under Apps,
            Chrome, Permissions.
          </li>
        </ol>
        <button onClick={microphone.request} type="button">
          Try again
        </button>
      </details>
    ))
    .with('failed', () => (
      <p className={control} role="alert">
        The microphone did not start.{' '}
        <button onClick={microphone.request} type="button">
          Try again
        </button>
      </p>
    ))
    .with('unavailable', () => <p className={control}>Voice typing needs nixie over HTTPS.</p>)
    .exhaustive();
}

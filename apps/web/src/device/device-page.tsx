import type { ContractClient } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { EnrolForm } from '../components/enrol-form';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { DeviceScreen } from './device-screen';
import { FullscreenButton } from './fullscreen-button';
import { readStoredScreen, writeStoredScreen } from './read-stored-screen';
import { RegisterDeviceForm } from './register-device-form';

type Phase =
  | { readonly kind: 'checking' }
  | { readonly kind: 'enrol' }
  | { readonly kind: 'register' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'signOutFailed' }
  | { readonly kind: 'ready'; readonly isScreenOn: boolean };

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: 'md',
  padding: '4',
  '& button': { borderColor: 'borderStrong', borderWidth: '1px', paddingBlock: '2' },
});

// Device mode: a device with a screen that the assistant puts pictures on. The page asks the server
// to set its screen the way this device left it, which tells it what this browser holds: no session
// shows the enrolment form, and a full session with no device shows the form that names one.
export function DevicePage(): ReactNode {
  const nixie = useNixieClient();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void startDevice(nixie.client, controller.signal, setPhase);

    return () => {
      controller.abort();
    };
  }, [nixie.client, attempt]);

  const setScreen = (isOn: boolean): void => {
    void switchScreen(nixie.client, isOn, setPhase);
  };

  const signOut = (): void => {
    void signOutDevice(nixie.client, setPhase);
  };

  if (phase.kind === 'checking') {
    return <main className={page}>Starting device mode</main>;
  }

  if (phase.kind === 'enrol') {
    return (
      <>
        <p className={page}>
          Device mode needs a code from Add a device on a signed-in client of nixie.
        </p>
        <EnrolForm
          onEnrolled={() => {
            setAttempt((count) => count + 1);
          }}
        />
      </>
    );
  }

  if (phase.kind === 'register') {
    return (
      <RegisterDeviceForm
        onRegistered={() => {
          writeStoredScreen(false);
          setPhase({ kind: 'ready', isScreenOn: false });
        }}
      />
    );
  }

  if (phase.kind === 'failed') {
    return (
      <main className={page}>
        <p role="alert">Device mode could not reach nixie.</p>
        <button
          onClick={() => {
            setAttempt((count) => count + 1);
          }}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }

  if (phase.kind === 'signOutFailed') {
    return (
      <main className={page}>
        <p role="alert">Device mode could not sign out, so this device is still signed in.</p>
        <button onClick={signOut} type="button">
          Try again
        </button>
      </main>
    );
  }

  if (phase.isScreenOn) {
    return (
      <DeviceScreen
        onClose={() => {
          void navigate({ to: '/' });
        }}
        onSwitchOff={() => {
          setScreen(false);
        }}
        onSignOut={signOut}
      />
    );
  }

  return (
    <main className={page}>
      <h1>Device mode</h1>
      <p>The screen of this device is off, so the assistant cannot show anything on it.</p>
      <button
        onClick={() => {
          setScreen(true);
        }}
        type="button"
      >
        Switch on screen
      </button>
      <FullscreenButton />
      <button onClick={signOut} type="button">
        Sign out
      </button>
    </main>
  );
}

type SetPhase = (phase: Phase) => void;

async function startDevice(
  client: ContractClient,
  signal: AbortSignal,
  setPhase: SetPhase,
): Promise<void> {
  const isOn = readStoredScreen();

  try {
    const answer = await client.devices.setCapability({ capability: 'screen', isOn }, { signal });

    setPhase({ kind: 'ready', isScreenOn: answer.screen === 'on' });
  } catch (error) {
    if (signal.aborted) {
      return;
    }

    setPhase(pickRefusedPhase(error));
  }
}

// A browser with no session enrols with a code. A session that holds no device registers one.
function pickRefusedPhase(error: unknown): Phase {
  if (!(error instanceof ORPCError)) {
    return { kind: 'failed' };
  }

  if (error.code === 'UNAUTHORIZED') {
    return { kind: 'enrol' };
  }

  return error.code === 'NOT_A_DEVICE' ? { kind: 'register' } : { kind: 'failed' };
}

async function switchScreen(
  client: ContractClient,
  isOn: boolean,
  setPhase: SetPhase,
): Promise<void> {
  try {
    const answer = await client.devices.setCapability({ capability: 'screen', isOn });

    writeStoredScreen(answer.screen === 'on');
    setPhase({ kind: 'ready', isScreenOn: answer.screen === 'on' });
  } catch {
    setPhase({ kind: 'failed' });
  }
}

async function signOutDevice(client: ContractClient, setPhase: SetPhase): Promise<void> {
  try {
    await client.sessions.signOut({});
  } catch (error) {
    // a session that is already gone is signed out
    const isGone = error instanceof ORPCError && error.code === 'UNAUTHORIZED';

    if (!isGone) {
      setPhase({ kind: 'signOutFailed' });

      return;
    }
  }

  setPhase({ kind: 'enrol' });
}

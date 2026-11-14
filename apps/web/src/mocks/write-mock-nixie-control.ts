import { pauseStore } from './pause-store';
import { readMockPause } from './read-mock-pause';

type MockNixieControl = 'pause' | 'resume';

interface NixieControlInput {
  readonly clientActionID: string;
}

type NixieControlResult =
  | { readonly status: 'controlled'; readonly paused: ReturnType<typeof readMockPause> }
  | { readonly status: 'reused' };

export async function writeMockNixieControl(
  control: MockNixieControl,
  input: NixieControlInput,
): Promise<NixieControlResult> {
  const earlier = pauseStore.nixieControlActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.control === control
      ? { status: 'controlled', paused: earlier.paused }
      : { status: 'reused' };
  }

  pauseStore.pauseExemptions.clear();
  pauseStore.pauses.clear();

  if (control === 'pause') {
    await pauseStore.pauses.create({ cause: 'owner' });
  }

  const paused = readMockPause();

  await pauseStore.nixieControlActions.create({
    clientActionID: input.clientActionID,
    control,
    paused,
  });

  return { status: 'controlled', paused };
}

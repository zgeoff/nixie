import { WringerError } from '@wringer/core';
import { pickModelInputRefusal } from './pick-model-input-refusal';

interface ModelInputWait {
  readonly contains: string;
  readonly waitMs?: number | undefined;
}

// Reads the model's last input until it holds the text, and fails with `check-failed` when it does
// not in time.
export async function waitForModelInput(
  readInput: () => Promise<{ readonly text: string }>,
  wait: ModelInputWait,
): Promise<{ text: string }> {
  const deadline = Date.now() + (wait.waitMs ?? 10_000);

  for (;;) {
    const input = await readInput();

    const refusal = pickModelInputRefusal(input.text, wait.contains);

    if (refusal === null) {
      return input;
    }

    if (Date.now() >= deadline) {
      throw new WringerError('check-failed', { message: refusal, data: input });
    }

    await Bun.sleep(200);
  }
}

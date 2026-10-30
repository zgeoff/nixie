import type { ProbeClient } from '../build-probe-client.ts';
import { formatCallError } from './format-call-error.ts';

// The parts of the home page that a tap on Pair reads and writes.
export interface PairForm {
  code: { value: string };
  result: { textContent: string | null };
  session: { textContent: string | null };
}

// Sends the entered code, then shows the session the probe made, or the probe's refusal.
export async function pairPhone(client: ProbeClient, form: PairForm): Promise<void> {
  form.result.textContent = await client.pair({ code: form.code.value }).then((paired) => {
    form.session.textContent = `Session: ${paired.session}`;

    return `Paired as ${paired.session}`;
  }, formatCallError);
}

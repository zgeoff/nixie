import type { FakeSpeechLayer } from '@heynixie/calls/test-utils';
import { buildFakeSpeechLayer } from '@heynixie/calls/test-utils';

// The speech layer of a test build that a harness drives. One nixie runs in a process, so the
// layer is the process's own, and the harness operations reach the same one that the calls use.
export const harnessSpeech: FakeSpeechLayer | null = NIXIE_TEST_BUILD
  ? buildFakeSpeechLayer()
  : null;

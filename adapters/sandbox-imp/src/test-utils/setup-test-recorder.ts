import { onTestFinished } from 'bun:test';
import type { TestRecorder } from './start-test-recorder';
import { startTestRecorder } from './start-test-recorder';

// A test recorder that stops when the test finishes. Inside beforeAll, Bun runs that hook as soon as
// beforeAll ends, so a suite takes startTestRecorder and stops it itself.
export async function setupTestRecorder(): Promise<TestRecorder> {
  const ctx = await startTestRecorder();

  onTestFinished(ctx.stop);
  return ctx;
}

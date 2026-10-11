import { expect, onTestFinished, test } from 'bun:test';
import { findWriterHandover } from './test-utils/find-writer-handover';
import { parseLiveEnv } from './test-utils/parse-live-env';
import { parseLogLines } from './test-utils/parse-log-lines';
import { parsePodWatchLine, podWatchTemplate } from './test-utils/parse-pod-watch-line';
import { requireLiveValue } from './test-utils/require-live-value';
import { runKubectl } from './test-utils/run-kubectl';
import { startKubectl } from './test-utils/start-kubectl';

// A live check against a deployed nixie, which docs/runbooks/live-checks.md runs. It skips unless
// the kubeconfig and the image to roll to are set, and it rolls the StatefulSet back to the image
// it found when it ends.
const live = parseLiveEnv(process.env);

async function setupTest() {
  const kubectl = requireLiveValue(live.kubectl, 'NIXIE_LIVE_KUBECONFIG');
  const image = await runKubectl(kubectl, [
    'get',
    'statefulset',
    'nixie',
    '--output',
    'jsonpath={.spec.template.spec.containers[?(@.name=="nixie")].image}',
  ]);
  const oldUID = await runKubectl(kubectl, [
    'get',
    'pod',
    'nixie-0',
    '--output',
    'jsonpath={.metadata.uid}',
  ]);

  // a roll to the image the StatefulSet runs changes nothing, so no pod would stop
  const newImage = live.rollImage === image ? null : live.rollImage;
  const rollImage = requireLiveValue(
    newImage,
    'NIXIE_LIVE_ROLL_IMAGE, naming a digest the StatefulSet does not run',
  );

  return { kubectl, rollImage, image, oldUID };
}

test.skipIf(live.kubectl === null || live.rollImage === null)(
  'it stops the old pod before the new pod opens the database when the StatefulSet rolls to a new digest',
  async () => {
    const ctx = await setupTest();

    // the old pod's log ends with the pod, so the check streams it from before the roll
    const oldLog = startKubectl(ctx.kubectl, [
      'logs',
      '--follow',
      'nixie-0',
      '--container',
      'nixie',
    ]);

    onTestFinished(() => oldLog.stop());

    const watch = startKubectl(ctx.kubectl, [
      'get',
      'pod',
      'nixie-0',
      '--watch',
      '--output-watch-events',
      '--output',
      `jsonpath=${podWatchTemplate}{"\\n"}`,
    ]);

    onTestFinished(() => watch.stop());
    onTestFinished(async () => {
      await runKubectl(ctx.kubectl, ['set', 'image', 'statefulset/nixie', `nixie=${ctx.image}`]);
      await runKubectl(ctx.kubectl, ['rollout', 'status', 'statefulset/nixie', '--timeout=10m']);
    });

    await runKubectl(ctx.kubectl, ['set', 'image', 'statefulset/nixie', `nixie=${ctx.rollImage}`]);
    await runKubectl(ctx.kubectl, ['rollout', 'status', 'statefulset/nixie', '--timeout=10m']);
    await oldLog.exited;

    const newUID = await runKubectl(ctx.kubectl, [
      'get',
      'pod',
      'nixie-0',
      '--output',
      'jsonpath={.metadata.uid}',
    ]);
    const newLog = await runKubectl(ctx.kubectl, ['logs', 'nixie-0', '--container', 'nixie']);

    await watch.stop();

    const handover = findWriterHandover(
      parseLogLines(oldLog.lines.join('\n')),
      parseLogLines(newLog),
    );
    const oldEnd = watch.lines
      .map((line) => parsePodWatchLine(line))
      .find((event) => event?.uid === ctx.oldUID && event.finishedAt !== null);

    expect(newUID).not.toBe(ctx.oldUID);
    expect(oldEnd?.exitCode).toBe(0);
    expect(handover).not.toBeNull();
    expect(handover?.oldStoppedAt).toBeBefore(handover?.newStartedAt ?? new Date(0));
    expect(handover?.newEpoch).toBeGreaterThan(handover?.oldEpoch ?? 0);

    // the cluster records an end time to the second, so it is at most the true end
    expect(oldEnd?.finishedAt?.getTime()).toBeLessThanOrEqual(
      handover?.newStartedAt.getTime() ?? Number.NEGATIVE_INFINITY,
    );
  },
  1_500_000,
);

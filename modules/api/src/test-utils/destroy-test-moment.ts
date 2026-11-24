import type { MomentStore, MomentTarget } from '@heynixie/memory';

type DestroyingMoments = Pick<MomentStore, 'beginDestroy' | 'finishDestroy'>;

// A destroy that runs to its end, as a route's does.
export async function destroyTestMoment(
  moments: DestroyingMoments,
  target: MomentTarget,
): Promise<void> {
  const begun = await moments.beginDestroy(target);

  if (begun.status === 'begun') {
    await moments.finishDestroy(begun.momentID);
  }
}

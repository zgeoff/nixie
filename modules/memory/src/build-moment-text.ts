import type { MomentDetail } from './read-moment-detail';

export function buildMomentText(detail: MomentDetail): string {
  return [detail.title, detail.note, ...detail.reflections.map((reflection) => reflection.text)]
    .filter((part) => part !== null)
    .join('\n');
}

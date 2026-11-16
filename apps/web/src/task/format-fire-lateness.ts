import { formatLateness } from '../components/format-lateness';
import type { ListedTask } from './use-live-task-list';

type TaskFire = NonNullable<ListedTask['fire']>;

// "fired 20 minutes late" for a catch-up fire, which fired after its time; null for a fire on time.
export function formatFireLateness(fire: TaskFire): string | null {
  if (!fire.isCatchUp) {
    return null;
  }

  const lateBySeconds = (Date.parse(fire.firedAt) - Date.parse(fire.scheduledFor)) / 1000;

  return `fired ${formatLateness(lateBySeconds)} late`;
}

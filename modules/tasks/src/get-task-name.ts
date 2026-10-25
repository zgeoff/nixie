import type { TaskMessaging } from './types';

export function getTaskName(messaging: Pick<TaskMessaging, 'directory'>, taskID: string): string {
  return messaging.directory.find((profile) => profile.taskID === taskID)?.name ?? taskID;
}

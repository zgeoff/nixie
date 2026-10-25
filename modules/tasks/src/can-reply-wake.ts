import type { StepWake, TaskMessaging } from './types';

export function canReplyWake(
  messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>,
  wake: StepWake,
  senderID: string,
): boolean {
  const sender = messaging.directory.find((profile) => profile.taskID === senderID);

  return sender?.isWokenByMessages === true && wake.hop + 1 <= messaging.hopLimit;
}

// The tools of the phone module. A send queues an action under its own name.
export const phoneToolNames = {
  list: 'phone.list',
  read: 'phone.read',
  send: 'phone.send',
  forget: 'phone.forget',
  wakeSet: 'phone.wake_set',
  wakeList: 'phone.wake_list',
  wakeCancel: 'phone.wake_cancel',
} as const;

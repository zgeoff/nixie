// The tools of the mail module. A send and a reply queue an action under their own name.
export const mailToolNames = {
  list: 'mail.list',
  read: 'mail.read',
  saveAttachment: 'mail.save_attachment',
  send: 'mail.send',
  reply: 'mail.reply',
  wakeSet: 'mail.wake_set',
  wakeList: 'mail.wake_list',
  wakeCancel: 'mail.wake_cancel',
} as const;

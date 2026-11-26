// The model's names for the Gmail tools. `gmail.*` names the connected Google account; `mail.*`
// names the assistant's own mailbox.
export const gmailToolNames = {
  search: 'gmail.search',
  read: 'gmail.read',
  readAttachment: 'gmail.read_attachment',
  label: 'gmail.label',
  draft: 'gmail.draft',
  send: 'gmail.send',
  reply: 'gmail.reply',
  sendDraft: 'gmail.send_draft',
} as const;

// The read-only checks that only the action queue calls. No tool list holds them.
export const gmailCheckNames = {
  sent: 'gmail.find_sent',
  labels: 'gmail.find_labels',
  draft: 'gmail.find_draft',
} as const;

// the one scope that every Gmail tool needs
export const gmailScope = 'gmail.modify';

// The 10 tools. The conversation's tool list holds all of them, and a task gets one only when its own
// list names it.
export const notebookToolNames = [
  'notebook.write',
  'notebook.edit',
  'notebook.read',
  'notebook.history',
  'notebook.find',
  'notebook.check',
  'notebook.link',
  'notebook.unlink',
  'notebook.walk',
  'notebook.forget',
] as const;

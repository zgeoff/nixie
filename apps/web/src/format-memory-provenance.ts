type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer';

type MemorySource = 'owner' | 'owner_data' | 'untrusted';

const origins: Readonly<Record<MemoryOrigin, string>> = {
  owner: 'you',
  conversation: 'the conversation',
  task: 'a task',
  memory_writer: 'the memory writer',
};

const sources: Readonly<Record<MemorySource, string>> = {
  owner: 'your own words',
  owner_data: 'your data',
  untrusted: 'outside content',
};

// Says who wrote a memory version and where its text came from, such as "by the memory writer,
// from your own words".
export function formatMemoryProvenance(origin: MemoryOrigin, source: MemorySource): string {
  return `by ${origins[origin]}, from ${sources[source]}`;
}

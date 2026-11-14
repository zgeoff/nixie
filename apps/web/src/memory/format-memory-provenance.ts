type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer' | 'lapse';

type MemorySource = 'owner' | 'owner_data' | 'untrusted';

const origins: Readonly<Record<MemoryOrigin, string>> = {
  owner: 'you',
  conversation: 'the conversation',
  task: 'a task',
  memory_writer: 'the memory writer',
  lapse: 'its end time',
};

const sources: Readonly<Record<MemorySource, string>> = {
  owner: 'your own words',
  owner_data: 'your data',
  untrusted: 'outside content',
};

export function formatMemoryProvenance(origin: MemoryOrigin, source: MemorySource): string {
  return `by ${origins[origin]}, from ${sources[source]}`;
}

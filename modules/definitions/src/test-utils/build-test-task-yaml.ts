export interface TestTaskYamlOptions {
  readonly brief?: string;
  readonly target?: 'task' | 'conversation';
}

// The task.yaml of water-the-tomatoes, a weekly schedule
export function buildTestTaskYaml(options: TestTaskYamlOptions = {}): string {
  return `name: Water the tomatoes
brief: ${options.brief ?? 'Water the tomatoes.'}
target: ${options.target ?? 'conversation'}
trigger:
  schedule:
    every: week
    on: fri
    at: "08:00"
`;
}

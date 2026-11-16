export interface TestTaskYamlOptions {
  readonly brief?: string;
  readonly target?: 'task' | 'conversation';
  readonly isEnabled?: boolean;
}

// The task.yaml of water-the-tomatoes, a weekly schedule
export function buildTestTaskYaml(options: TestTaskYamlOptions = {}): string {
  return `name: Water the tomatoes
brief: ${options.brief ?? 'Water the tomatoes.'}
target: ${options.target ?? 'conversation'}
${options.isEnabled === false ? 'enabled: false\n' : ''}trigger:
  schedule:
    every: week
    on: fri
    at: "08:00"
`;
}

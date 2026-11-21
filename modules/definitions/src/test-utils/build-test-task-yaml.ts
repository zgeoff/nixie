export interface TestTaskYamlOptions {
  readonly brief?: string;
  readonly isEnabled?: boolean;
}

// The task.yaml of water-the-tomatoes, a weekly schedule
export function buildTestTaskYaml(options: TestTaskYamlOptions = {}): string {
  return `name: Water the tomatoes
brief: ${options.brief ?? 'Water the tomatoes.'}
${options.isEnabled === false ? 'enabled: false\n' : ''}trigger:
  schedule:
    repeat:
      frequency: weekly
      byDay: [fri]
      at: ["08:00"]
      starts: "2026-11-20"
`;
}

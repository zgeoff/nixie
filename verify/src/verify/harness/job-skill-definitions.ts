// 2 skills and a job that lists one of them, which fires every 5 minutes
export const jobSkillDefinitions = {
  skills: [
    { name: 'tide-tables', description: 'Reads a tide table.', body: '# Tides\nRead the table.' },
    { name: 'bird-log', description: 'Logs a bird sighting.', body: '# Birds\nLog the bird.' },
  ],
  taskDefinitions: [
    {
      id: 'water-the-tomatoes',
      yaml: [
        'name: Water the tomatoes',
        'brief: Water the tomatoes in the greenhouse and report when done.',
        'skills:',
        '  - tide-tables',
        'trigger:',
        '  schedule:',
        '    every:',
        '      minutes: 5',
        '',
      ].join('\n'),
      instructions: 'Keep the report to one line.\n',
    },
  ],
};

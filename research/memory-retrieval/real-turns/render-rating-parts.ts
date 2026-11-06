import type { SampleTurn } from './build-sample.ts';

// Renders the sample as parts a rater reads one at a time, each with the instructions on top. Each
// text is a JSON string, so a line break or a heading inside a message cannot break the layout.
export function renderRatingParts(turns: SampleTurn[], perPart: number): string[] {
  const parts: string[] = [];
  const count = Math.ceil(turns.length / perPart);

  for (let part = 0; part < count; part += 1) {
    const slice = turns.slice(part * perPart, (part + 1) * perPart);

    parts.push([...renderInstructions(part + 1, count), ...slice.flatMap((turn) => renderTurn(turn))].join('\n'));
  }

  return parts;
}

function renderInstructions(part: number, count: number): string[] {
  return [
    `# Memory rating, part ${part} of ${count}`,
    '',
    'Each turn below is a real turn of yours: the exchange before it, the message, and your reply.',
    'Under it is a list of memory items (M1, M2, ...) and past messages (P1, ...). Some of them were',
    'shown to you on that turn, and some were not. The order says nothing.',
    '',
    'For each turn, name every item or past message that would have helped your reply, had it been in',
    'front of you then. Leave out what you would have ignored. Name none when nothing would have helped.',
    'Then name the single most useful one, or null.',
    '',
    'Under "misleading", name each item or past message that would have made your reply worse.',
    'Under "missing", describe in a few words each memory you know of that would have helped and is',
    'not in the list. Leave either list empty when there is none.',
    '',
    'Answer with one JSON line per turn, and nothing else:',
    '',
    '{"caseID":"t123","relevant":["M2","P1"],"best":"M2","misleading":["M4"],"missing":[],"by":"assistant"}',
    '{"caseID":"t456","relevant":[],"best":null,"misleading":[],"missing":["the ferry timetable"],"by":"assistant"}',
    '',
  ];
}

function renderTurn(turn: SampleTurn): string[] {
  return [
    `## ${turn.caseID}`,
    ...turn.earlier.flatMap((exchange) => [
      `Before, they wrote: ${JSON.stringify(exchange.owner)}`,
      `Before, you replied: ${JSON.stringify(exchange.reply)}`,
    ]),
    `Message: ${JSON.stringify(turn.message)}`,
    `Your reply: ${JSON.stringify(turn.reply)}`,
    ...turn.items.map((item) => `- ${item.ref}: ${JSON.stringify(item.text)}`),
    '',
  ];
}

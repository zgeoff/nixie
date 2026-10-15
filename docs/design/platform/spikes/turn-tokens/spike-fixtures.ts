// Invented text for every run: a persona, an owner called Sam, memories, a 12-message
// conversation, jobs, worker briefs, and the scripted tools' results in the production result
// shapes. None of it comes from a real deployment.
import type { ToolSet } from './build-role-tools';

const day = Date.UTC(2026, 9, 14, 8, 0);
const dayMs = 24 * 60 * 60 * 1000;

const persona = `You are nixie, a personal assistant that works for one person, Sam. You run on Sam's own server and you keep Sam's notes, plans and memories private.

Speak plainly and warmly, the way a capable friend would. Keep replies short unless Sam asks for depth: a line or two for small talk, a short list when Sam needs options, and a clear recommendation when Sam asks you to choose. Never pad a reply with offers of more help.

Sam lives in Lisbon, works as a structural engineer, and plans most weekends around hiking, cooking and a slow restoration of an old bicycle. Sam prefers metric units and 24-hour times.

When you are not sure of a fact, say so and say how you would find out. Use your tools for anything time-sensitive: the time, the web and your memory. Report only what a tool result says; never claim an action that no tool ran. Save a memory only when Sam states a fact about their own life, and quote Sam's own words when you do.`;

// each memory's text and the words Sam said that it was saved from
const coreTexts = [
  ['Sam is vegetarian and cooks most evenings.', "I've been vegetarian for ten years and I cook most evenings"],
  ['Sam is allergic to cashews.', "I'm allergic to cashews, so no cashew sauces please"],
  ["Sam's sister Ines lives in Porto.", 'my sister Ines lives in Porto'],
  ['Sam rides a 1984 steel touring bicycle that they are restoring.', "I'm restoring my 1984 steel touring bike"],
  ['Sam works as a structural engineer at a small firm.', "I'm a structural engineer at a small firm"],
  ['Sam prefers trains to flights for trips under 600 km.', "I'd rather take the train than fly if it's under 600 km"],
  ['Sam sees a dentist at Clinica Sorriso every six months.', 'my dentist is at Clinica Sorriso, every six months'],
  ['Sam is learning to bake sourdough.', "I'm learning to bake sourdough"],
  ['Sam hikes most Saturdays in Sintra or Arrabida.', 'most Saturdays I hike in Sintra or Arrabida'],
  ['Sam does not drink coffee after 14:00.', "no coffee after 14:00 or I don't sleep"],
] as const;

const otherTexts = [
  ['Sam is planning a cycling trip along the Douro in late spring.', "I'm planning to cycle along the Douro in late spring"],
  ["Sam's bike needs a new rear derailleur.", 'the bike needs a new rear derailleur'],
  ["Sam's friend Tomas lends them hiking poles.", 'Tomas lends me his hiking poles'],
  ['Sam wants to read more Portuguese fiction this year.', 'I want to read more Portuguese fiction this year'],
  ['Sam keeps their sourdough starter in the fridge between bakes.', 'the starter lives in the fridge between bakes'],
  ['Sam takes the 08:10 train to work on weekdays.', 'I take the 08:10 train to work'],
  ['Sam likes a strong black tea in the morning.', 'I like a strong black tea in the morning'],
  ['Sam is saving for a new pair of hiking boots.', "I'm saving for new hiking boots"],
  ["Sam's office is near Cais do Sodre.", 'my office is near Cais do Sodre'],
  ['Sam enjoys making lentil soups in winter.', 'I love making lentil soup in winter'],
  ['Sam booked a ceramics class for November.', 'I booked a ceramics class for November'],
  ['Sam dislikes very spicy food.', "I don't like very spicy food"],
  ['Sam has a balcony herb garden with basil and thyme.', 'I grow basil and thyme on the balcony'],
  ["Sam's sister Ines has a birthday on 3 December.", "Ines's birthday is 3 December"],
  ['Sam uses a paper notebook for weekly planning.', 'I plan my week in a paper notebook'],
  ['Sam is learning a little German for a work project.', "I'm learning a little German for a work project"],
  ["Sam's running route goes along the river to Belem.", 'my running route goes along the river to Belem'],
  ['Sam prefers aisle seats on trains.', 'I always pick an aisle seat on the train'],
  ['Sam wants to visit the Azores one day.', 'I want to visit the Azores one day'],
  ['Sam gave up a gym membership in favour of cycling.', 'I cancelled the gym and cycle instead'],
  ['Sam bakes bread on Sunday mornings.', 'I bake bread on Sunday mornings'],
  ['Sam cannot eat raw onion without heartburn.', 'raw onion gives me heartburn'],
  ['Sam needs to renew their passport next year.', 'my passport needs renewing next year'],
  ['Sam likes podcasts about architecture.', 'I like podcasts about architecture'],
  ['Sam keeps spare inner tubes in the hallway cupboard.', 'spare inner tubes are in the hallway cupboard'],
  ["Sam's favourite trail is the Peninha loop.", 'the Peninha loop is my favourite trail'],
  ['Sam has a library card for the Galveias library.', 'I have a card for the Galveias library'],
  ['Sam tries to walk 10,000 steps a day.', 'I try to walk 10,000 steps a day'],
  ['Sam prefers Tuesday evenings for video calls with Ines.', 'Tuesday evenings are best for calls with Ines'],
  ['Sam is looking for a used road bike for faster rides.', "I'm looking for a used road bike for faster rides"],
  ['Sam does not like meetings before 09:00.', "I don't like meetings before 09:00"],
  ['Sam makes granola every two weeks.', 'I make granola every two weeks'],
  ['Sam reads before bed instead of using their phone.', 'I read before bed instead of scrolling'],
  ['Sam wants to learn to true wheels themselves.', 'I want to learn to true my own wheels'],
  ['Sam visits a farmers market on Saturday mornings when not hiking.', "if I'm not hiking I go to the farmers market on Saturday morning"],
  ['Sam drinks oat milk.', 'I drink oat milk'],
  ['Sam has a cast iron pan they season carefully.', 'I season my cast iron pan carefully'],
  ['Sam wants to try a long-distance walk in Spain.', 'I want to do a long-distance walk in Spain'],
  ["Sam's laptop is three years old and slowing down.", 'my laptop is three years old and getting slow'],
  ['Sam enjoys jazz on Friday evenings.', 'Friday evenings are for jazz'],
  ['Sam once lived in Coimbra as a student.', 'I lived in Coimbra as a student'],
  ['Sam plans meals for the week on Sunday afternoons.', 'I plan the week of meals on Sunday afternoon'],
  ['Sam likes to keep their inbox close to empty.', 'I like my inbox close to empty'],
  ['Sam is thinking about getting a cat.', "I'm thinking about getting a cat"],
  ['Sam prefers paper tickets for long train trips.', 'I prefer paper tickets for long train trips'],
  ['Sam wants a reminder before the dentist appointment.', 'remind me before the dentist'],
  ['Sam bought a new headlamp for winter rides.', 'I bought a new headlamp for winter rides'],
  ['Sam stores tomatoes outside the fridge.', 'tomatoes stay out of the fridge'],
  ['Sam avoids sugary breakfast cereals.', 'I avoid sugary cereals'],
  ['Sam has a rain jacket that needs re-proofing.', 'my rain jacket needs re-proofing'],
] as const;

const coreItems = coreTexts.map(([text, quote], index) => ({
  itemID: crypto.randomUUID(),
  version: 1,
  shortID: `m${(index + 10).toString(36)}${(index * 7 + 3).toString(36)}`,
  text,
  origin: 'memory_writer' as const,
  source: 'owner' as const,
  recordedAt: day - (40 - index) * dayMs,
  evidenceQuote: quote,
  approval: null,
}));

const otherItems = otherTexts.map(([text, quote], index) => ({
  itemID: crypto.randomUUID(),
  version: 1 + (index % 3 === 0 ? 1 : 0),
  shortID: `n${(index + 36).toString(36)}${(index * 5 + 7).toString(36)}`,
  text,
  origin: 'memory_writer' as const,
  source: 'owner' as const,
  recordedAt: day - (60 - index) * dayMs,
  evidenceQuote: quote,
  approval: null,
}));

const allItems = [...coreItems, ...otherItems];

// Each message, and the items the turn's retrieval places before it, by index into otherItems.
const conversation = [
  { text: 'Morning! What time is it in Tokyo right now? I have a call with a supplier there later.', retrieved: [] },
  { text: 'Thanks. Can you remind me what I said about my bike? I want to order parts this week.', retrieved: [1, 24, 29] },
  {
    text: 'I found this guide to replacing a rear derailleur: https://example.com/guides/rear-derailleur-swap - can you read it and tell me what tools I need?',
    retrieved: [],
  },
  { text: 'Great. I do not have a chain tool, so I will borrow one from Tomas.', retrieved: [2] },
  { text: 'Different topic: give me a vegetarian dinner idea for tonight, nothing with cashews, about 30 minutes.', retrieved: [9, 11, 21] },
  { text: 'Lovely, I will do the lentil one. By the way, I have started running twice a week, on Tuesdays and Thursdays.', retrieved: [16] },
  { text: 'Can you check what memory changes are waiting for me to review?', retrieved: [] },
  { text: 'Thanks, I will look at those tonight. What do you know about my plans for the Douro trip?', retrieved: [0, 17] },
  {
    text: 'Here is the train timetable page for Porto to Regua: https://example.com/timetables/douro-line - which morning train gets me there before 11:00?',
    retrieved: [],
  },
  { text: 'Perfect. My sister Ines says she can join for the first two days.', retrieved: [13, 28] },
  { text: 'Last thing: what did we talk about yesterday regarding the ceramics class?', retrieved: [10] },
  { text: 'Thanks, that is all for now. Have a good afternoon.', retrieved: [] },
] as const;

const buildPage = (url: string, sections: readonly string[]) =>
  JSON.stringify({
    url,
    status: 200,
    contentType: 'text/html',
    text: Array.from({ length: 4 }, (_, round) =>
      sections.map((section) => `${section} (part ${round + 1})`).join('\n\n'),
    ).join('\n\n'),
    isTruncated: false,
    blocked: null,
  });

const derailleurPage = buildPage('https://example.com/guides/rear-derailleur-swap', [
  'Replacing a rear derailleur: a workshop guide. Before you start, shift the chain onto the smallest rear cog and the smallest chainring. This releases tension in the cable and makes the old derailleur easy to remove. Hang the bike on a stand if you have one, or turn it upside down on a soft mat.',
  'You will need a 5 mm hex key for the mounting bolt, a cable cutter that cuts cleanly without fraying, a chain tool or a quick-link plier, a Phillips screwdriver for the limit screws and a small amount of grease for the bolt threads.',
  'Undo the cable pinch bolt and pull the cable free. Break the chain or open its quick link, then unscrew the derailleur from the hanger. Check the hanger is straight before you fit the new part; a bent hanger causes most poor shifting.',
  'Thread the new derailleur onto the hanger by hand first, then tighten to the torque printed on the body, usually 8 to 10 Nm. Route the chain through the jockey wheels, close the chain and set the high and low limit screws.',
  'Finally clamp the cable, set the barrel adjuster and shift through every gear. Fine tune with the barrel adjuster a quarter turn at a time until shifts are crisp in both directions.',
]);

const timetablePage = buildPage('https://example.com/timetables/douro-line', [
  'Douro line: Porto Sao Bento to Regua, weekday timetable. Regional trains leave Porto Sao Bento at 06:20, 07:25, 09:15, 11:20, 13:15, 15:15, 17:15 and 19:10. Journey time to Regua is about 1 h 55 min, with stops at Ermesinde, Penafiel, Livracao and Mosteiro.',
  'The 07:25 departure arrives in Regua at 09:20 and the 09:15 departure arrives at 11:12. Trains from Porto Campanha leave five minutes after the Sao Bento times.',
  'Bicycles travel free on regional trains when space allows, up to two per carriage. Tickets can be bought at the station or online, and seats are not reserved on regional services.',
  'On weekends the 07:25 does not run, and an extra departure leaves at 08:05, arriving in Regua at 10:02. Check for engineering works before travelling in the summer months.',
]);

// The memory state the scripted tools keep for one process, which runs one role: the proposals
// that wait for review, two of them seeded, and each proposal or change a call adds.
const pending: Record<string, unknown>[] = [
  {
    proposalID: 'p4k1',
    change: 'new',
    text: 'Sam is learning to make rye bread.',
    notedBy: ['the note-taker'],
    reason: 'the checker was unsure the message stated it',
    age: '1 day',
  },
  {
    proposalID: 'p4k2',
    change: 'edit',
    itemID: otherItems[1]!.shortID,
    version: otherItems[1]!.version,
    text: "Sam's bike needs a new rear derailleur and a new chain.",
    notedBy: ['the note-taker'],
    reason: 'it changes an item you approved',
    age: '2 days',
  },
];
let nextProposal = 3;

const findItems = (query: unknown) => {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\W+/u)
    .filter((word) => word.length > 3);
  const found = allItems.filter((item) => words.some((word) => item.text.toLowerCase().includes(word)));

  return (found.length > 0 ? found : otherItems.slice(0, 3)).slice(0, 5);
};

const renderRecalled = (item: (typeof allItems)[number]) => ({
  version: item.version,
  change: item.version === 1 ? 'new' : 'edit',
  state: 'active',
  text: item.text,
  about: `${item.shortID} v${item.version}, ${new Date(item.recordedAt).toISOString().slice(0, 10)}, noted by the note-taker from Sam's words`,
  quote: item.evidenceQuote,
  model: 'claude-haiku-5-5',
  itemID: item.shortID,
  isPinned: coreItems.includes(item as (typeof coreItems)[number]),
});

const conversationAnswers: Record<string, (input: Record<string, unknown>) => unknown> = {
  'time.now': () => ({
    utc: '2026-10-14T08:12:40Z',
    local: '2026-10-14T09:12:40+01:00',
    weekday: 'Wednesday',
    timeZone: 'Europe/Lisbon',
    timeZoneFrom: 'message',
  }),
  web_fetch: (input) => JSON.parse(String(input['url'] ?? '').includes('timetable') ? timetablePage : derailleurPage),
  'log.read': (input) => ({
    entries: String(input['query'] ?? '').toLowerCase().includes('ceramic')
      ? [
          { eventID: '84', role: 'owner', recordedAt: '2026-10-13T17:40:00Z', text: 'I booked the ceramics class at the studio near Graca for 8 November, 10:00 to 13:00.', isCut: false },
          { eventID: '85', role: 'assistant', recordedAt: '2026-10-13T17:40:20Z', text: 'Noted: ceramics on Saturday 8 November, 10:00 to 13:00, near Graca. Bring old clothes.', isCut: false },
        ]
      : [
          { eventID: '84', role: 'owner', recordedAt: '2026-10-13T17:40:00Z', text: 'I booked the ceramics class at the studio near Graca for 8 November, 10:00 to 13:00.', isCut: false },
          { eventID: '85', role: 'assistant', recordedAt: '2026-10-13T17:40:20Z', text: 'Noted: ceramics on Saturday 8 November, 10:00 to 13:00, near Graca. Bring old clothes.', isCut: false },
          { eventID: '86', role: 'owner', recordedAt: '2026-10-13T17:42:00Z', text: 'And remind me the bike still needs its derailleur.', isCut: false },
        ],
    next: null,
  }),
  'memory.recall': (input) => {
    const ids = Array.isArray(input['itemIDs']) ? input['itemIDs'].map(String) : [];
    const items = ids.length > 0 ? allItems.filter((item) => ids.includes(item.shortID)) : findItems(input['query']);

    return { items: items.map(renderRecalled), next: null };
  },
  'memory.rate': (input) => ({
    message: `Noted ${Array.isArray(input['ratings']) ? input['ratings'].length : 0} ratings.`,
  }),
  'memory.pending': () => ({ proposals: pending }),
  'memory.remember': (input) => {
    const proposalID = `p4k${nextProposal++}`;

    pending.push({
      proposalID,
      change: 'new',
      text: String(input['text'] ?? ''),
      notedBy: ['the assistant'],
      reason: 'a new fact waits for your review',
      age: 'just now',
    });
    return { status: 'proposed', proposalID, reason: 'a new fact waits for your review' };
  },
  'memory.edit': (input) => ({
    status: 'applied',
    itemID: String(input['itemID'] ?? ''),
    version: Number(input['version'] ?? 1) + 1,
  }),
  'memory.retire': (input) => ({
    status: 'applied',
    itemID: String(input['itemID'] ?? ''),
    version: Number(input['version'] ?? 1),
  }),
  'memory.diff': () => ({ changes: [] }),
  'memory.comment': (input) => ({ changeID: String(input['changeID'] ?? ''), status: 'commented' }),
};

const writerAnswers: Record<string, (input: Record<string, unknown>) => unknown> = {
  'memory.recall': (input) => ({
    items: findItems(input['query']).map((item) => ({ itemID: item.shortID, text: item.text })),
  }),
  'memory.remember': () => ({ staged: true }),
  'memory.edit': () => ({ staged: true }),
  'memory.retire': () => ({ staged: true }),
};

const consolidatorAnswers: Record<string, (input: Record<string, unknown>) => unknown> = {
  'memory.recall': (input) => ({
    items: findItems(input['query']).map((item) => ({
      itemID: item.shortID,
      text: item.text,
      quote: item.evidenceQuote,
    })),
  }),
  'memory.consolidate': (input) => ({
    staged: Array.isArray(input['changes']) ? input['changes'].length : 0,
  }),
};

// the scripted answer to one call, as JSON text, from the answers of the role's tool set
const answerCall = (set: ToolSet, name: string, input: Record<string, unknown>): string => {
  const answers = { conversation: conversationAnswers, worker: conversationAnswers, 'memory-writer': writerAnswers, 'memory-consolidator': consolidatorAnswers }[set];
  const answer = answers[name];

  if (answer === undefined) {
    throw new Error(`no scripted answer for ${name} in the ${set} tools`);
  }
  return JSON.stringify(answer(input));
};

const jobs = [
  'Job: morning brief. Read the Douro timetable at https://example.com/timetables/douro-line and the time, then write Sam a three-line brief for today with the next useful train and one reminder from memory.',
  'Job: weekly bike check. Recall what Sam has said about the bicycle, read the guide at https://example.com/guides/rear-derailleur-swap, and write a short parts and tools list Sam could order this week.',
  'Job: review pending memory. List the memory changes waiting for review and write Sam a two-line summary of each, with your recommendation.',
] as const;

const workerBriefs = [
  'Read https://example.com/guides/rear-derailleur-swap and https://example.com/timetables/douro-line, then return five bullet points: the tools the guide needs and the trains that reach Regua before 11:00.',
  'Read https://example.com/guides/rear-derailleur-swap and return the torque values and the order of the steps, as a numbered list of at most eight lines.',
  'Read https://example.com/timetables/douro-line and return every weekday departure with its arrival time, as a table.',
] as const;

export const fixtures = {
  day,
  persona,
  ownerName: 'Sam',
  coreItems,
  otherItems,
  conversation,
  answerCall,
  jobs,
  workerBriefs,
  workerPrompt:
    'You are a worker for nixie, a personal assistant. Do the one task in the message with your tools, then reply with only the result the task asks for. Report only what a tool result says.',
};

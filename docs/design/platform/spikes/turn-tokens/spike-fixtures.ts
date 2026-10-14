// Invented text for every run: a persona, an owner called Sam, memories, a 12-message
// conversation, jobs, worker briefs and the pages and results the scripted tools answer with. None
// of it comes from a real deployment.

const day = Date.UTC(2026, 9, 14, 8, 0);
const dayMs = 24 * 60 * 60 * 1000;

const persona = `You are nixie, a personal assistant that works for one person, Sam. You run on Sam's own server and you keep Sam's notes, plans and memories private.

Speak plainly and warmly, the way a capable friend would. Keep replies short unless Sam asks for depth: a line or two for small talk, a short list when Sam needs options, and a clear recommendation when Sam asks you to choose. Never pad a reply with offers of more help.

Sam lives in Lisbon, works as a structural engineer, and plans most weekends around hiking, cooking and a slow restoration of an old bicycle. Sam prefers metric units and 24-hour times.

When you are not sure of a fact, say so and say how you would find out. Use your tools for anything time-sensitive: the time, the web and your memory. Report only what a tool result says; never claim an action that no tool ran. Save a memory only when Sam states a fact about their own life, and quote Sam's own words when you do.`;

const coreTexts = [
  ['Sam is vegetarian and cooks most evenings.', 'I have been vegetarian for ten years now'],
  ['Sam is allergic to cashews.', 'I am allergic to cashews, so no cashew sauces please'],
  ["Sam's sister Ines lives in Porto.", 'my sister Ines is in Porto'],
  ['Sam rides a 1984 steel touring bicycle that they are restoring.', 'my 1984 steel tourer'],
  ['Sam works as a structural engineer at a small firm.', 'I am a structural engineer'],
  ['Sam prefers trains to flights for trips under 600 km.', 'I would rather take the train if it is under 600 km'],
  ['Sam has a dentist appointment every six months at Clinica Sorriso.', 'my dentist at Clinica Sorriso'],
  ['Sam is learning to bake sourdough.', 'I started a sourdough starter last month'],
  ['Sam hikes most Saturdays in Sintra or Arrabida.', 'Saturdays are for Sintra or Arrabida'],
  ['Sam does not drink coffee after 14:00.', 'no coffee after two or I do not sleep'],
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

const otherTexts = [
  'Sam is planning a cycling trip along the Douro in late spring.',
  "Sam's bike needs a new rear derailleur.",
  "Sam's friend Tomas lends them hiking poles.",
  'Sam wants to read more Portuguese fiction this year.',
  'Sam keeps their sourdough starter in the fridge between bakes.',
  'Sam takes the 08:10 train to work on weekdays.',
  'Sam likes a strong black tea in the morning.',
  'Sam is saving for a new pair of hiking boots.',
  "Sam's office is near Cais do Sodre.",
  'Sam enjoys making lentil soups in winter.',
  'Sam booked a ceramics class for November.',
  'Sam dislikes very spicy food.',
  'Sam has a balcony herb garden with basil and thyme.',
  "Sam's sister Ines has a birthday on 3 December.",
  'Sam uses a paper notebook for weekly planning.',
  'Sam is learning a little German for a work project.',
  "Sam's running route goes along the river to Belem.",
  'Sam prefers aisle seats on trains.',
  'Sam wants to visit the Azores one day.',
  'Sam gave up a gym membership in favour of cycling.',
  'Sam bakes bread on Sunday mornings.',
  'Sam cannot eat raw onion without heartburn.',
  'Sam needs to renew their passport next year.',
  'Sam likes podcasts about architecture.',
  'Sam keeps spare inner tubes in the hallway cupboard.',
  "Sam's favourite trail is the Peninha loop.",
  'Sam has a library card for the Galveias library.',
  'Sam tries to walk 10,000 steps a day.',
  'Sam prefers Tuesday evenings for video calls with Ines.',
  'Sam is looking for a used road bike for faster rides.',
  'Sam does not like early meetings before 09:00.',
  'Sam makes granola every two weeks.',
  'Sam reads before bed instead of using their phone.',
  'Sam wants to learn to repair wheels themselves.',
  'Sam visits a farmers market on Saturday mornings when not hiking.',
  'Sam drinks oat milk.',
  'Sam has a cast iron pan they season carefully.',
  'Sam wants to try a long-distance walk in Spain.',
  "Sam's laptop is three years old and slowing down.",
  'Sam enjoys jazz on Friday evenings.',
  'Sam once lived in Coimbra as a student.',
  'Sam plans meals for the week on Sunday afternoons.',
  'Sam likes to keep their inbox close to empty.',
  'Sam is thinking about getting a cat.',
  'Sam prefers paper tickets for long train trips.',
  'Sam wants a reminder before the dentist appointment.',
  'Sam bought a new headlamp for winter rides.',
  'Sam stores tomatoes outside the fridge.',
  'Sam avoids sugary breakfast cereals.',
  'Sam has a rain jacket that needs re-proofing.',
] as const;

const otherItems = otherTexts.map((text, index) => ({
  itemID: crypto.randomUUID(),
  version: 1 + (index % 3 === 0 ? 1 : 0),
  shortID: `n${(index + 36).toString(36)}${(index * 5 + 7).toString(36)}`,
  text,
  origin: 'memory_writer' as const,
  source: 'owner' as const,
  recordedAt: day - (60 - index) * dayMs,
  evidenceQuote: `I said once that ${text.charAt(0).toLowerCase()}${text.slice(1, -1)}`,
  approval: null,
}));

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
  { text: 'Approve the running one, it is right. What do you know about my plans for the Douro trip?', retrieved: [0, 17] },
  {
    text: 'Here is the train timetable page for Porto to Regua: https://example.com/timetables/douro-line - which morning train gets me there before 11:00?',
    retrieved: [],
  },
  { text: 'Perfect. My sister Ines says she can join for the first two days.', retrieved: [13, 28] },
  { text: 'Last thing: what did we talk about yesterday regarding the ceramics class?', retrieved: [10] },
  { text: 'Thanks, that is all for now. Have a good afternoon.', retrieved: [] },
] as const;

const page = (title: string, sections: readonly string[]) =>
  JSON.stringify({
    status: 200,
    title,
    text: Array.from({ length: 4 }, (_, round) =>
      sections.map((section) => `${section} (part ${round + 1})`).join('\n\n'),
    ).join('\n\n'),
  });

const derailleurPage = page('Replacing a rear derailleur: a workshop guide', [
  'Before you start, shift the chain onto the smallest rear cog and the smallest chainring. This releases tension in the cable and makes the old derailleur easy to remove. Hang the bike on a stand if you have one, or turn it upside down on a soft mat.',
  'You will need a 5 mm hex key for the mounting bolt, a cable cutter that cuts cleanly without fraying, a chain tool or a quick-link plier, a Phillips screwdriver for the limit screws and a small amount of grease for the bolt threads.',
  'Undo the cable pinch bolt and pull the cable free. Break the chain or open its quick link, then unscrew the derailleur from the hanger. Check the hanger is straight before you fit the new part; a bent hanger causes most poor shifting.',
  'Thread the new derailleur onto the hanger by hand first, then tighten to the torque printed on the body, usually 8 to 10 Nm. Route the chain through the jockey wheels, close the chain and set the high and low limit screws.',
  'Finally clamp the cable, set the barrel adjuster and shift through every gear. Fine tune with the barrel adjuster a quarter turn at a time until shifts are crisp in both directions.',
]);

const timetablePage = page('Douro line: Porto Sao Bento to Regua, weekday timetable', [
  'Regional trains leave Porto Sao Bento at 06:20, 07:25, 09:15, 11:20, 13:15, 15:15, 17:15 and 19:10. Journey time to Regua is about 1 h 55 min, with stops at Ermesinde, Penafiel, Livracao and Mosteiro.',
  'The 07:25 departure arrives in Regua at 09:20 and the 09:15 departure arrives at 11:12. Trains from Porto Campanha leave five minutes after the Sao Bento times.',
  'Bicycles travel free on regional trains when space allows, up to two per carriage. Tickets can be bought at the station or online, and seats are not reserved on regional services.',
  'On weekends the 07:25 does not run, and an extra departure leaves at 08:05, arriving in Regua at 10:02. Check for engineering works before travelling in the summer months.',
]);

const answers: Record<string, (input: Record<string, unknown>) => string> = {
  'time.now': () =>
    JSON.stringify({ now: '2026-10-14T09:12:40+01:00', zone: 'Europe/Lisbon', weekday: 'Wednesday' }),
  web_fetch: (input) =>
    String(input['url'] ?? '').includes('timetable') ? timetablePage : derailleurPage,
  'log.read': () =>
    JSON.stringify({
      records: [
        { id: 'r7k2', at: '2026-10-13T18:40:00+01:00', role: 'owner', text: 'I booked the ceramics class at the studio near Graca for 8 November, 10:00 to 13:00.' },
        { id: 'r7k3', at: '2026-10-13T18:40:20+01:00', role: 'assistant', text: 'Noted: ceramics on Saturday 8 November, 10:00 to 13:00, near Graca. Bring old clothes.' },
      ],
      next: null,
    }),
  'memory.recall': (input) =>
    JSON.stringify({
      items: otherItems
        .filter((item) => item.text.toLowerCase().includes(String(input['query'] ?? 'bike').split(' ')[0]?.toLowerCase() ?? ''))
        .slice(0, 5)
        .concat(otherItems.slice(0, 2))
        .map((item) => ({ id: item.shortID, text: item.text, saved: '2026-09-01', quote: item.evidenceQuote })),
    }),
  'memory.pending': () =>
    JSON.stringify({
      proposals: [
        { id: 'p3f1', operation: 'remember', text: 'Sam runs on Tuesdays and Thursdays.', age: '2 minutes', reason: 'the checker was unsure' },
        { id: 'p3f2', operation: 'edit', item: 'n1a7', text: "Sam's bike needs a new rear derailleur and chain.", age: '1 day', reason: 'it changes an approved item' },
      ],
    }),
  'memory.remember': () => JSON.stringify({ status: 'proposed', proposal: 'p3f3', reason: 'waits for your review' }),
  'memory.edit': () => JSON.stringify({ status: 'applied', item: 'n1a7', version: 3 }),
  'memory.retire': () => JSON.stringify({ status: 'applied' }),
  'memory.rate': () => JSON.stringify({ rated: 2 }),
  'memory.diff': () => JSON.stringify({ diff: null }),
  'memory.comment': () => JSON.stringify({ commented: true }),
  'memory.consolidate': () => JSON.stringify({ staged: true }),
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
  answers,
  jobs,
  workerBriefs,
  workerPrompt:
    'You are a worker for nixie, a personal assistant. Do the one task in the message with your tools, then reply with only the result the task asks for. Report only what a tool result says.',
};

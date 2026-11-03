// Invented text for every run: a persona, an owner called Rowan, the candidate pinned items, the
// edits the runs make to the core, and the messages of both runs. None of it comes from a real
// deployment.
// @boundaries-ignore a spike imports the code it measures
import type { MemoryItem } from '../../modules/sessions/src/types';

export const ownerName = 'Rowan';
export const defaultZone = 'Europe/Amsterdam';

export const persona = `You are nixie, a personal assistant that works for one person, Rowan. You run on Rowan's own server and you keep Rowan's notes, plans and memories private.

Speak plainly and warmly, the way a capable friend would. Keep replies short unless Rowan asks for depth: a line or two for small talk, a short list when Rowan needs options, and a clear recommendation when Rowan asks you to choose. Never pad a reply with offers of more help.

Rowan lives in Utrecht and works as a hydrologist for the regional water board. Rowan prefers metric units and 24-hour times.

When you are not sure of a fact, say so and say how you would find out. Never claim an action you did not take.`;

type Subject = MemoryItem['subject'];

interface CandidateItem {
  readonly key: string;
  readonly subject: Subject;
  readonly text: string;
  readonly quote: string | null;
}

// in pin order; the runs pin from the top until the next pin would pass the budget, as the store
// refuses a pin past it, so the items the runs change sit near the middle of the owner's group
const candidates: readonly CandidateItem[] = [
  { key: 'diet', subject: 'owner', text: 'Rowan is pescatarian: fish yes, meat no.', quote: "I eat fish but no meat, pescatarian I guess" },
  { key: 'bins', subject: 'owner', text: "Rowan's bins go out on Wednesday evenings for Thursday collection.", quote: 'bins go out Wednesday night, they collect Thursday' },
  { key: 'work', subject: 'owner', text: 'Rowan works as a hydrologist for the regional water board, mostly from the Houten office.', quote: "I'm a hydrologist at the water board, mostly at the Houten office" },
  { key: 'partner', subject: 'owner', text: "Rowan's partner is Juniper, a primary school teacher.", quote: 'Juniper teaches at a primary school' },
  { key: 'train', subject: 'owner', text: 'Rowan cycles to Houten and takes the 07:40 train home when it rains.', quote: 'if it rains I take the 07:40 train back instead of cycling' },
  { key: 'cat', subject: 'owner', text: 'Rowan has a tabby cat called Biscuit, who is eleven.', quote: "Biscuit's eleven now, my old tabby" },
  { key: 'vet', subject: 'owner', text: 'Biscuit goes to Dr. Amara Osei at Larkfield Vets.', quote: 'Biscuit sees Dr. Osei at Larkfield Vets' },
  { key: 'wifi', subject: 'owner', text: 'The guest wifi password at home is heron-42.', quote: 'guest wifi is heron-42' },
  { key: 'sister', subject: 'owner', text: "Rowan's sister Edda lives in Ghent.", quote: 'my sister Edda lives in Ghent' },
  { key: 'dentist', subject: 'owner', text: 'Rowan sees a dentist at Tandartspraktijk Oudegracht twice a year.', quote: 'my dentist is the Oudegracht practice, twice a year' },
  { key: 'coffee', subject: 'owner', text: 'Rowan drinks no coffee after 15:00.', quote: 'no coffee after three or I lie awake' },
  { key: 'choir', subject: 'owner', text: 'Rowan sings tenor in a community choir that rehearses on Monday evenings.', quote: 'choir is Monday nights, I sing tenor' },
  { key: 'bike', subject: 'owner', text: 'Rowan rides a green Gazelle with a dodgy rear brake.', quote: 'my green Gazelle, the back brake is dodgy' },
  { key: 'mother', subject: 'owner', text: "Rowan's mother, Ilse, lives in Leeuwarden and prefers phone calls on Sunday afternoons.", quote: 'Mum likes a call Sunday afternoon, she is up in Leeuwarden' },
  { key: 'allotment', subject: 'owner', text: 'Rowan has an allotment plot, number 23, at the Kromme Rijn gardens.', quote: 'plot 23 at Kromme Rijn' },
  { key: 'lens', subject: 'owner', text: 'Rowan wears contact lenses and keeps a spare pair in the bathroom drawer.', quote: 'spare lenses are in the bathroom drawer' },
  { key: 'birthday', subject: 'owner', text: "Rowan's birthday is 9 March.", quote: 'my birthday is the ninth of March' },
  { key: 'running', subject: 'owner', text: 'Rowan runs 5 km along the Vecht on Saturday mornings.', quote: 'Saturday morning 5k along the Vecht' },
  { key: 'car', subject: 'owner', text: 'Rowan has no car and uses a shared car from the street when needed.', quote: "no car, I use the shared one on our street" },
  { key: 'reading', subject: 'owner', text: 'Rowan is reading through the Earthsea books in order.', quote: "I'm working through Earthsea in order" },
  { key: 'nickname', subject: 'shared', text: 'Rowan calls you "the oracle" when you get something right, as a joke between you.', quote: 'oracle strikes again' },
  { key: 'tone', subject: 'shared', text: 'You and Rowan agreed you will flag any plan that skips lunch.', quote: 'call me out if I plan a day with no lunch' },
  { key: 'format', subject: 'shared', text: 'Rowan asked for train times as a short list, departure first.', quote: 'give me train times as a list, departure first' },
  { key: 'self-dates', subject: 'self', text: 'I write dates as day, month name and year, because Rowan misread a numeric date once.', quote: null },
  { key: 'self-check', subject: 'self', text: 'I check the day of the week before I name a weekday for a date.', quote: null },
  { key: 'self-brief', subject: 'self', text: 'I keep replies to a few lines unless Rowan asks for more.', quote: null },
  { key: 'plants', subject: 'owner', text: 'Rowan waters the balcony tomatoes every evening in summer.', quote: 'tomatoes get watered every evening in summer' },
  { key: 'neighbour', subject: 'owner', text: "Rowan's neighbour Bram has a spare key.", quote: 'Bram next door has a spare key' },
  { key: 'tea', subject: 'owner', text: 'Rowan likes rooibos in the evening.', quote: 'rooibos in the evening' },
  { key: 'museum', subject: 'owner', text: 'Rowan has a Museumkaart that runs out in June.', quote: 'my Museumkaart runs out in June' },
  { key: 'doctor', subject: 'owner', text: "Rowan's GP is Dr. Femke Aalders at the Lombok health centre.", quote: 'my GP is Dr. Aalders at the Lombok health centre' },
  { key: 'bank', subject: 'owner', text: 'Rowan pays rent on the 1st of each month by standing order.', quote: 'rent goes out on the first by standing order' },
  { key: 'juniper-birthday', subject: 'owner', text: "Juniper's birthday is 14 November, and she likes old jazz records.", quote: 'Juniper turns another year on the 14th of November, get her a jazz record' },
  { key: 'language', subject: 'owner', text: 'Rowan is learning Danish on the train, about ten minutes a day.', quote: 'ten minutes of Danish a day on the train' },
  { key: 'board-games', subject: 'owner', text: 'Rowan hosts a board game night on the first Friday of each month.', quote: 'board games at mine on the first Friday' },
  { key: 'glasses', subject: 'owner', text: 'Rowan needs reading glasses for small print but hates admitting it.', quote: 'fine, I need the reading glasses for small print' },
  { key: 'holiday', subject: 'owner', text: 'Rowan and Juniper are planning a walking holiday in the Eifel next May.', quote: "we're thinking the Eifel for a walking holiday in May" },
  { key: 'insurance', subject: 'owner', text: "Rowan's bike insurance renews in February.", quote: 'bike insurance renews in February' },
  { key: 'gym', subject: 'owner', text: 'Rowan swims at the Krommerijn pool on Thursday lunchtimes.', quote: 'Thursday lunch I swim at the Krommerijn pool' },
  { key: 'plants-away', subject: 'owner', text: 'When Rowan travels, Bram waters the plants and feeds Biscuit.', quote: 'Bram does the plants and feeds Biscuit when we are away' },
  { key: 'radio', subject: 'owner', text: 'Rowan listens to the shipping forecast to fall asleep.', quote: 'I fall asleep to the shipping forecast' },
  { key: 'self-weather', subject: 'self', text: 'I mention rain before Rowan cycles anywhere, because Rowan asked me to.', quote: null },
  { key: 'shoe-size', subject: 'owner', text: 'Rowan wears EU size 44 shoes.', quote: 'size 44 shoes' },
  { key: 'film', subject: 'owner', text: 'Rowan prefers films in the original language with subtitles.', quote: 'original language with subtitles, always' },
];

const day = 24 * 60 * 60 * 1000;

// the core's items saved over the 60 days before the first run
const firstSaved = Date.UTC(2026, 7, 20, 9, 0);

export const candidateItems: readonly MemoryItem[] = candidates.map((candidate, index) =>
  buildItem(candidate, index, 1),
);

// the edits the runs make, each a new version of a candidate or a new item
export const edits = {
  sister: buildItem(
    {
      key: 'sister',
      subject: 'owner',
      text: "Rowan's sister Edda lives in Rotterdam.",
      quote: 'Edda has moved to Rotterdam now',
    },
    candidates.findIndex((candidate) => candidate.key === 'sister'),
    2,
  ),
  wifi: buildItem(
    { key: 'wifi', subject: 'owner', text: 'The guest wifi password at home is kestrel-17.', quote: 'new guest wifi password, kestrel-17' },
    candidates.findIndex((candidate) => candidate.key === 'wifi'),
    2,
  ),
  vet: buildItem(
    {
      key: 'vet',
      subject: 'owner',
      text: 'Biscuit goes to Dr. Tobias Hale at Millbrook Vets.',
      quote: 'we switched Biscuit to Dr. Hale at Millbrook',
    },
    candidates.findIndex((candidate) => candidate.key === 'vet'),
    2,
  ),
  allergy: buildItem(
    { key: 'allergy', subject: 'owner', text: 'Rowan is allergic to penicillin.', quote: "turns out I'm allergic to penicillin" },
    candidates.length,
    1,
  ),
} as const;

// a stable item ID and short ID per candidate, so a run file names the same item on every run
function buildItem(candidate: CandidateItem, index: number, version: number): MemoryItem {
  return {
    itemID: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    version,
    shortID: `r${(index + 11).toString(36)}${(index * 7 + 5).toString(36).padStart(2, '0')}k${String(index % 10)}q`,
    subject: candidate.subject,
    text: candidate.text,
    origin: candidate.subject === 'self' ? 'conversation' : 'memory_writer',
    source: candidate.subject === 'self' ? 'untrusted' : 'owner',
    model: candidate.subject === 'self' ? 'claude-opus-5-5' : null,
    recordedAt: firstSaved + index * day,
    evidenceQuote: candidate.quote,
    approval: candidate.subject === 'self' ? { isQuotePasted: false } : null,
  };
}

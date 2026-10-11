/* oxlint-disable max-lines -- a throwaway spike */
// 30 short memory items, each with one question an owner might type, plus 50 distractor items that
// share their vocabulary. Every name, place and number is invented. 10 questions share a content
// word with their memory (lexical) and 20 share none (paraphrase).

export interface Pair {
  id: string;
  type: 'lexical' | 'paraphrase';
  memory: string;
  query: string;
}

type Row = [id: string, type: Pair['type'], memory: string, query: string];

const ROWS: Row[] = [
  // lexical
  ['coffee', 'lexical', 'Jo takes coffee as a flat white with oat milk.', 'how do I like my coffee'],
  ['gate-code', 'lexical', 'The gate code at the new flat is 4471.', "what's the gate code"],
  ['bin-day', 'lexical', 'Recycling bins go out on Tuesday night.', 'which night do the recycling bins go out'],
  ['dentist', 'lexical', 'The dentist is Dr Okafor at Riverside Dental.', 'who is my dentist'],
  ['bike-lock', 'lexical', 'The bike lock combination is 0912.', 'bike lock combo?'],
  ['plant', 'lexical', 'The fiddle leaf fig needs water every 10 days.', 'how often should I water the fig'],
  ['car-rego', 'lexical', 'The car registration renews on 3 February.', 'when is the car registration due'],
  ['passport', 'lexical', 'Jo’s passport expires in August 2029.', 'when does my passport expire'],
  ['gym', 'lexical', 'Jo goes to the gym on Monday, Wednesday and Friday mornings.', 'what days do I go to the gym'],
  ['nan-bday', 'lexical', 'Nan’s birthday is 22 June.', "when is Nan's birthday"],

  // paraphrase
  ['partner', 'paraphrase', 'Jo’s partner is Priya, a structural engineer.', 'who am I married to'],
  ['lactose', 'paraphrase', 'Jo cannot digest lactose.', 'can I have dairy'],
  ['vegetarian', 'paraphrase', 'Jo has not eaten meat since 2019.', 'any food restrictions I should mention when booking dinner'],
  ['cat', 'paraphrase', 'Pepper is a grey tabby who hates the vacuum.', "what's my pet called"],
  ['kid-school', 'paraphrase', 'Arlo starts year 2 at Hillcrest Primary.', 'where does my son go to school'],
  ['commute', 'paraphrase', 'Jo rides the 7:40 train from Elm Park to the city.', 'how do I get to work'],
  ['salary', 'paraphrase', 'Jo’s pay rose to 118,000 a year in April.', 'how much do I earn'],
  ['allergy', 'paraphrase', 'Bee stings put Jo in hospital in 2021; the EpiPen lives in the hall drawer.', "where's my adrenaline injector"],
  ['landlord', 'paraphrase', 'Marcus owns the flat and prefers texts over calls.', 'how should I contact the owner of my rental'],
  ['sister', 'paraphrase', 'Lena moved to Lisbon for a teaching job in March.', 'where does my sibling live now'],
  ['blood-pressure', 'paraphrase', 'Jo takes 5 mg of amlodipine each morning.', 'what medication am I on for hypertension'],
  ['wifi', 'paraphrase', 'The router password is on a sticker under the TV unit.', 'where can I find the internet login'],
  ['insurance', 'paraphrase', 'Contents cover is with Harbourline, policy HL-55120.', 'who insures my stuff at home'],
  ['fear', 'paraphrase', 'Jo gets anxious on ladders and avoids heights.', 'am I scared of anything'],
  ['music', 'paraphrase', 'Jo plays bass in a covers band called Low Tide.', 'what instrument do I play'],
  ['shoes', 'paraphrase', 'Jo wears a size 43 in running trainers.', 'what size sneakers should I order'],
  ['mechanic', 'paraphrase', 'Tony at Northside Auto services the Corolla.', 'who fixes my car'],
  ['bedtime', 'paraphrase', 'Arlo is asleep by 7:30 on school nights.', 'what time does my kid go down in the evening'],
  ['language', 'paraphrase', 'Jo is learning Portuguese on Thursday evenings.', 'what class do I take during the week'],
  ['anniversary', 'paraphrase', 'Jo and Priya married on 9 November 2017.', 'when is our wedding anniversary'],
];

export const PAIRS: Pair[] = ROWS.map(([id, type, memory, query]) => ({ id, memory, query, type }));

// distractors share words and topics with the memories above but answer none of the questions
export const DISTRACTORS: string[] = [
  'Priya prefers green tea in the afternoon.',
  'The coffee machine descales every 3 months.',
  'The office building door code changes each quarter.',
  'Garden waste is collected every second Friday.',
  'Arlo had a check-up at Riverside Dental in May.',
  'The spare house key is with the neighbour at number 12.',
  'The basil on the windowsill came from the Saturday market.',
  'Priya’s car insurance renews in October.',
  'Jo renewed the library card in January.',
  'The gym membership includes two guest passes a month.',
  'Nan likes lemon cake and crosswords.',
  'Priya’s firm designs bridges and stadiums.',
  'The cafe on Elm Street does good almond croissants.',
  'Jo booked a table at Sorrel for Friday at 7.',
  'Pepper’s vet is Dr Lin at Parkside Animal Clinic.',
  'Hillcrest Primary sends newsletters on Mondays.',
  'The train line has trackwork on the last weekend of the month.',
  'Jo’s tax return is done by an accountant called Ruth.',
  'The first aid kit is in the laundry cupboard.',
  'Marcus replaced the oven in 2023.',
  'Lena’s birthday is 2 December.',
  'Jo had a flu shot in April.',
  'The router was replaced after the storm last winter.',
  'The TV streaming account is shared with Lena.',
  'The home loan is fixed until 2027.',
  'Jo climbed Mount Wellington with Priya in 2022.',
  'Low Tide rehearses on Sunday afternoons.',
  'Jo’s hiking boots are a size 44.',
  'The Corolla is due for new tyres soon.',
  'Arlo likes dinosaur books before sleep.',
  'Priya speaks Hindi and some Spanish.',
  'The wedding photos are in the blue album.',
  'Jo prefers aisle seats on long flights.',
  'The kitchen tap drips when the hot water is on.',
  'Jo’s work laptop is a 14 inch ThinkPad.',
  'The kids’ swimming lessons are on Saturday at 9.',
  'Jo donated blood in July.',
  'The neighbour’s dog barks at the postman.',
  'Jo’s bank card was replaced in March after it was skimmed.',
  'Priya runs the half marathon every September.',
  'The chimney was swept last autumn.',
  'Jo keeps receipts in a shoebox in the study.',
  'Arlo is allergic to nothing so far.',
  'The electricity plan is with Brightside Energy.',
  'Lena teaches English to adults.',
  'Jo’s manager is called Deb.',
  'The bathroom fan is noisy and needs a new motor.',
  'Jo’s favourite band is The Shins.',
  'Priya drives a blue Mazda 3.',
  'Jo bought Pepper a scratching post in May.',
];

/* oxlint-disable max-lines, max-statements, one-var, sort-vars, unicorn/prefer-single-call -- a throwaway spike */
// Synthetic memory items for a fictional owner, Sam Rivera. Every name, address and account is
// invented, and each item is one row: a kind, the fact as text, and the date it was stored.

export interface Item {
  id: string;
  kind: string;
  text: string;
  date: string;
}

type Row = [id: string, kind: string, date: string, text: string];

const ROWS: Row[] = [
  // the owner
  ['owner-name', 'person', '2025-01-04', 'The owner is Sam Rivera; Sam uses they/them pronouns.'],
  ['owner-birthday', 'person', '2025-01-04', "Sam's birthday is 14 March 1988."],
  ['owner-job', 'work', '2025-01-04', 'Sam works as a product designer at Tidewater Labs.'],
  ['owner-home', 'place', '2025-01-04', 'Sam lives at 42 Wren Street, Port Ellis.'],
  ['owner-allergy', 'health', '2025-01-06', 'Sam is allergic to penicillin.'],
  ['owner-blood', 'health', '2025-02-10', "Sam's blood type is O negative."],
  ['owner-diet', 'preference', '2025-01-08', "Sam doesn't eat red meat but eats fish and chicken."],
  ['owner-coffee', 'preference', '2025-01-08', 'Sam takes coffee as a flat white with oat milk.'],
  [
    'owner-tea',
    'preference',
    '2025-04-02',
    'In the evening Sam drinks chamomile tea, never caffeine after 3 pm.',
  ],
  [
    'owner-wake',
    'routine',
    '2025-01-09',
    'Sam wakes at 6:30 on weekdays and wants the morning report by 7:00.',
  ],
  [
    'owner-quiet',
    'preference',
    '2025-01-09',
    'No notifications between 22:00 and 6:30 unless something is urgent.',
  ],
  [
    'owner-lang',
    'preference',
    '2025-01-10',
    'Sam is learning Portuguese and practises on Duolingo every evening.',
  ],
  ['owner-shoe', 'person', '2025-05-11', 'Sam wears shoe size 42 EU.'],
  ['owner-shirt', 'person', '2025-05-11', "Sam's shirt size is medium, slim fit."],
  ['owner-myopia', 'health', '2025-03-03', 'Sam is short-sighted and wears glasses for driving.'],
  ['owner-sleep', 'health', '2025-09-14', 'Sam sleeps badly when they drink wine after 9 pm.'],
  [
    'owner-hates',
    'preference',
    '2025-02-20',
    'Sam dislikes phone calls and prefers text messages.',
  ],
  [
    'owner-music',
    'preference',
    '2025-06-01',
    'Sam listens to jazz while working, mostly Bill Evans.',
  ],
  [
    'owner-seat',
    'preference',
    '2025-03-15',
    'On flights Sam prefers an aisle seat near the front.',
  ],
  [
    'owner-car',
    'thing',
    '2025-01-20',
    'Sam drives a 2019 grey Toyota Corolla hybrid, plate PE-482-KT.',
  ],

  // family
  ['partner', 'person', '2025-01-04', "Alex Kim is Sam's wife; they married in 2016."],
  [
    'partner-work',
    'person',
    '2025-01-04',
    'Alex works night shifts as an ICU nurse at Port Ellis General.',
  ],
  ['partner-birthday', 'person', '2025-01-05', "Alex's birthday is 2 September."],
  [
    'partner-gift',
    'preference',
    '2025-08-20',
    'Alex would love a new pair of trail running shoes.',
  ],
  [
    'partner-allergy',
    'health',
    '2025-01-05',
    'Alex has a severe peanut allergy and carries an EpiPen.',
  ],
  ['anniversary', 'person', '2025-01-05', 'The wedding anniversary is 18 June.'],
  ['kid-mia', 'person', '2025-01-04', 'Mia is Sam and Alex’s daughter, born 9 November 2017.'],
  ['kid-theo', 'person', '2025-01-04', 'Theo is their son, born 23 April 2020.'],
  ['mia-school', 'place', '2025-01-12', 'Mia goes to Harbourside Primary, in year 3 this year.'],
  [
    'theo-daycare',
    'place',
    '2025-01-12',
    'Theo attends Little Acorns daycare on Mondays, Wednesdays and Fridays.',
  ],
  [
    'mia-swim',
    'routine',
    '2025-02-01',
    'Mia has swimming lessons on Tuesdays at 4:30 pm at the aquatic centre.',
  ],
  [
    'theo-asthma',
    'health',
    '2025-03-09',
    'Theo has mild asthma; his blue inhaler lives in the kitchen drawer.',
  ],
  ['mia-teacher', 'person', '2025-02-03', "Mia's teacher is Ms Haddad."],
  ['mia-friend', 'person', '2025-04-14', "Mia's best friend is Zoe Lin; Zoe's dad is Mark Lin."],
  [
    'theo-dino',
    'preference',
    '2025-05-02',
    'Theo is obsessed with dinosaurs, especially the triceratops.',
  ],
  [
    'mia-piano',
    'routine',
    '2025-09-01',
    'Mia started piano lessons with Mrs Novak on Thursday afternoons.',
  ],
  ['mom', 'person', '2025-01-07', "Rosa Rivera is Sam's mother; she lives in Lisbon."],
  ['mom-phone', 'contact', '2025-01-07', "Rosa's phone number is +351 912 000 145."],
  ['mom-birthday', 'person', '2025-01-07', "Rosa's birthday is 30 January."],
  ['dad', 'person', '2025-01-07', "Sam's father, Miguel, died in 2019."],
  ['brother', 'person', '2025-01-07', 'Luis Rivera is Sam’s younger brother and lives in Toronto.'],
  ['brother-kids', 'person', '2025-03-01', 'Luis has twins, Ana and Rafa, born in 2022.'],
  [
    'in-laws',
    'person',
    '2025-01-15',
    "Alex's parents, June and Peter Kim, live two hours north in Ashby.",
  ],
  ['dog', 'thing', '2025-01-04', 'The family dog is Biscuit, a five-year-old beagle.'],
  [
    'dog-food',
    'preference',
    '2025-02-18',
    'Biscuit eats only the salmon formula of Hillcrest dry food.',
  ],
  [
    'dog-walk',
    'routine',
    '2025-01-10',
    'Sam walks Biscuit at 7:15 every morning around Linden Park.',
  ],

  // friends and work people
  [
    'friend-priya',
    'person',
    '2025-01-18',
    'Priya Shah is a close friend from university; she lives in Port Ellis.',
  ],
  ['friend-priya-kid', 'person', '2025-07-02', 'Priya is expecting her first baby in December.'],
  [
    'friend-ben',
    'person',
    '2025-02-22',
    'Ben Osei plays five-a-side football with Sam on Wednesday nights.',
  ],
  [
    'friend-ben-move',
    'person',
    '2026-05-10',
    'Ben moved to Glasgow in May 2026, so Wednesday football ended.',
  ],
  [
    'friend-nora',
    'person',
    '2025-03-30',
    'Nora Fitch runs the book club Sam joins on the first Sunday of each month.',
  ],
  ['boss', 'work', '2025-01-04', "Hannah Cole is Sam's manager at Tidewater Labs."],
  ['boss-new', 'work', '2026-07-01', 'Since July 2026 Sam reports to Dev Mehta, not Hannah Cole.'],
  [
    'colleague-jo',
    'work',
    '2025-02-11',
    'Jo Park is the engineer Sam pairs with on the Harbor app.',
  ],
  [
    'work-days',
    'routine',
    '2025-01-04',
    'Sam works from the office on Tuesdays and Thursdays and from home otherwise.',
  ],
  ['office', 'place', '2025-01-04', 'The Tidewater office is on level 5, 10 Quay Road.'],
  [
    'work-project',
    'work',
    '2025-06-15',
    'Sam leads the redesign of the Harbor checkout flow, due in November.',
  ],
  [
    'work-project-done',
    'work',
    '2026-01-20',
    'The Harbor checkout redesign shipped in January 2026.',
  ],
  [
    'work-project-2',
    'work',
    '2026-03-02',
    'Sam now leads the onboarding research project for the Kelp product.',
  ],
  [
    'work-review',
    'work',
    '2025-10-01',
    'Performance reviews at Tidewater happen in October and April.',
  ],
  ['work-1on1', 'routine', '2026-07-03', 'The weekly 1:1 with Dev Mehta is on Mondays at 10:00.'],
  ['work-standup', 'routine', '2025-01-06', 'Team standup is at 9:30 every weekday on video.'],

  // health providers
  ['gp', 'health', '2025-01-06', "Sam's GP is Dr Ifeoma Okafor at Northside Medical Centre."],
  [
    'gp-phone',
    'contact',
    '2025-01-06',
    'Northside Medical Centre: 03 5550 1180, bookings online via HealthLink.',
  ],
  [
    'dentist',
    'health',
    '2025-01-21',
    'The family dentist is Bright Smile Dental on Market Street.',
  ],
  [
    'dentist-next',
    'health',
    '2026-08-15',
    'Next dental check-up for Sam is 12 November 2026 at 8:40.',
  ],
  [
    'physio',
    'health',
    '2025-06-05',
    'Sam sees Tom Reyes, a physiotherapist, for a sore lower back.',
  ],
  [
    'physio-exercises',
    'health',
    '2025-06-12',
    'Back exercises: cat-cow, bird-dog and glute bridges, 10 minutes daily.',
  ],
  ['optometrist', 'health', '2025-03-03', 'Eye tests are at ClearView Optometry, every two years.'],
  [
    'med-vitd',
    'health',
    '2025-11-02',
    'Sam takes a vitamin D supplement each morning over winter.',
  ],
  [
    'bloodtest',
    'health',
    '2026-02-20',
    'Blood test in February 2026 showed low iron; retest in six months.',
  ],
  ['vet', 'health', '2025-02-18', "Biscuit's vet is Dr Amy Lowe at Parkside Vet Clinic."],
  ['vet-vaccine', 'health', '2026-04-03', 'Biscuit’s annual vaccination is due every April.'],
  ['paediatrician', 'health', '2025-03-09', "The kids' paediatrician is Dr Sora Ito."],
  [
    'therapy',
    'health',
    '2025-09-10',
    'Sam sees a counsellor, Ruth Abara, every second Friday at 17:00.',
  ],

  // home and services
  [
    'home-wifi',
    'thing',
    '2025-01-11',
    'Home internet is with Fibrenet, account number FN-2209-4471.',
  ],
  [
    'home-power',
    'thing',
    '2025-01-11',
    'Electricity and gas are with Brightwater Energy, billed quarterly.',
  ],
  ['home-rent', 'thing', '2025-01-11', 'Rent is 2,350 a month, paid on the 1st to Harbour Realty.'],
  [
    'home-landlord',
    'contact',
    '2025-01-11',
    'The property manager at Harbour Realty is Craig Dunn, craig.dunn@example.com.',
  ],
  [
    'home-bins',
    'routine',
    '2025-01-14',
    'Rubbish goes out Sunday night; recycling every second week.',
  ],
  [
    'home-cleaner',
    'routine',
    '2025-03-01',
    'A cleaner, Marta, comes every second Thursday morning.',
  ],
  ['home-plumber', 'contact', '2025-08-08', 'Good plumber: Dave from FlowRight, 0400 555 812.'],
  [
    'home-boiler',
    'thing',
    '2025-08-08',
    'The hot water system was replaced in August 2025 under warranty until 2030.',
  ],
  ['home-lease', 'thing', '2025-01-11', 'The lease on Wren Street ends 31 January 2027.'],
  [
    'home-move-plan',
    'thing',
    '2026-06-20',
    'Sam and Alex plan to buy a house in Ashby Hills in 2027.',
  ],
  [
    'home-mortgage',
    'thing',
    '2026-08-30',
    'Mortgage pre-approval from Coastline Bank is valid until February 2027.',
  ],
  [
    'home-garden',
    'preference',
    '2025-04-20',
    'Sam grows tomatoes, basil and chillies on the balcony.',
  ],
  ['home-wifi-pass', 'thing', '2025-01-11', 'The guest Wi-Fi network is RiveraGuest.'],
  [
    'home-alarm',
    'thing',
    '2025-05-05',
    'The building entry code changes every quarter; Craig emails it.',
  ],

  // accounts and money
  [
    'bank',
    'account',
    '2025-01-11',
    'Everyday banking is with Coastline Bank; savings account is at Juniper.',
  ],
  ['bank-budget', 'preference', '2025-02-01', 'The monthly grocery budget is 900.'],
  ['credit-card', 'account', '2025-01-11', 'The main credit card is a Coastline Visa ending 4417.'],
  ['tax', 'account', '2025-07-01', 'Taxes are done by an accountant, Lena Brooks, each August.'],
  [
    'insurance-car',
    'account',
    '2025-01-20',
    'Car insurance is with Shield Mutual, renewing every 20 January.',
  ],
  [
    'insurance-health',
    'account',
    '2025-01-20',
    'Private health cover is with Medway, family policy MW-77120.',
  ],
  [
    'subscriptions',
    'account',
    '2025-03-12',
    'Subscriptions: Netflix, Spotify family, iCloud 200 GB and the Port Ellis Times.',
  ],
  ['subscription-cancel', 'account', '2026-04-11', 'Sam cancelled Netflix in April 2026.'],
  [
    'pension',
    'account',
    '2025-07-15',
    'Retirement savings are in the Tidewater plan with Northstar Super.',
  ],
  ['email-personal', 'contact', '2025-01-04', "Sam's personal email is sam.rivera@example.com."],
  ['email-work', 'contact', '2025-01-04', "Sam's work email is sam@tidewater.example.com."],
  ['phone', 'contact', '2025-01-04', "Sam's mobile is 0400 555 019."],
  ['alex-phone', 'contact', '2025-01-05', "Alex's mobile is 0400 555 233."],
  ['priya-email', 'contact', '2025-01-18', "Priya's email is priya.shah@example.com."],
  ['ben-handle', 'contact', '2025-02-22', 'Ben is @benosei on Signal.'],
  ['library-card', 'account', '2025-04-04', 'Port Ellis library card number 20094418.'],
  [
    'frequent-flyer',
    'account',
    '2025-03-15',
    'Frequent flyer number with Southern Air is SA 8820 1147.',
  ],
  ['passport', 'account', '2025-03-15', "Sam's passport expires in October 2027."],
  ['alex-passport', 'account', '2025-03-15', "Alex's passport expires in March 2026."],
  [
    'alex-passport-renewed',
    'account',
    '2026-02-14',
    'Alex renewed her passport in February 2026; it expires in 2036.',
  ],

  // routines and preferences
  [
    'groceries',
    'routine',
    '2025-01-12',
    'Groceries are ordered online from FreshCo for Saturday morning delivery.',
  ],
  [
    'groceries-new',
    'routine',
    '2026-03-08',
    'Sam switched the grocery order from FreshCo to GreenBasket in March 2026.',
  ],
  ['meal-plan', 'routine', '2025-02-15', 'Sunday afternoon is meal planning and batch cooking.'],
  ['pizza-friday', 'routine', '2025-01-17', 'Friday night is homemade pizza night with the kids.'],
  [
    'date-night',
    'routine',
    '2025-05-01',
    'Sam and Alex have date night the last Saturday of the month; Priya babysits.',
  ],
  [
    'restaurant-fav',
    'preference',
    '2025-05-25',
    'Favourite restaurant is Osteria Lume on Pier Street.',
  ],
  [
    'restaurant-avoid',
    'preference',
    '2025-08-02',
    "Don't book Saltbox again; the service was terrible.",
  ],
  [
    'restaurant-thai',
    'preference',
    '2025-06-14',
    'For takeaway, the family likes Baan Thai on Elm Road.',
  ],
  [
    'gym',
    'routine',
    '2025-01-15',
    'Sam goes to FitHub on King Street on Monday, Wednesday and Friday at 6 am.',
  ],
  [
    'gym-new',
    'routine',
    '2026-08-01',
    'Sam left FitHub and now swims at Harbour Pool on Tuesday and Thursday mornings.',
  ],
  ['run', 'routine', '2025-03-20', 'Saturday morning parkrun at Linden Park, 5 km.'],
  ['run-pb', 'routine', '2026-05-16', 'Parkrun personal best: 24:51 in May 2026.'],
  [
    'reading',
    'preference',
    '2025-03-30',
    'Sam prefers paper books for fiction and Kindle for non-fiction.',
  ],
  [
    'news',
    'preference',
    '2025-01-09',
    'The morning report should include weather, calendar, and three news headlines, no sport.',
  ],
  [
    'news-new',
    'preference',
    '2026-09-02',
    'Add the Port Ellis tide times to the morning report since Sam started swimming.',
  ],
  ['weather-unit', 'preference', '2025-01-09', 'Use Celsius and kilometres.'],
  [
    'calendar-colour',
    'preference',
    '2025-02-05',
    'Family events go in the shared Family calendar, work events in Tidewater.',
  ],
  ['tone', 'preference', '2025-01-09', 'Keep replies short and skip the pleasantries.'],
  [
    'church',
    'routine',
    '2025-04-06',
    'Rosa expects a video call every Sunday at 19:00 Lisbon time.',
  ],
  ['holiday-xmas', 'routine', '2025-11-20', 'Christmas 2025 is at the Kims in Ashby.'],
  ['holiday-xmas-26', 'routine', '2026-09-20', 'Christmas 2026 will be in Lisbon with Rosa.'],
  [
    'school-holidays',
    'routine',
    '2025-01-12',
    'School holidays: two weeks in April, July and late September.',
  ],
  [
    'babysitter',
    'contact',
    '2025-05-01',
    'Backup babysitter is Kayla, a neighbour, 0400 555 670, 20 an hour.',
  ],
  [
    'carpool',
    'routine',
    '2025-02-04',
    'Mark Lin and Sam share the school run; Mark does Mondays and Wednesdays.',
  ],

  // travel
  [
    'trip-lisbon-25',
    'travel',
    '2025-06-10',
    'Family trip to Lisbon 5 to 26 July 2025 to see Rosa.',
  ],
  [
    'trip-lisbon-flight',
    'travel',
    '2025-06-10',
    'Lisbon flights booked on Southern Air, reference QK7P2L.',
  ],
  [
    'trip-japan',
    'travel',
    '2026-05-22',
    'Sam and Alex plan a two-week trip to Japan in April 2027 without the kids.',
  ],
  [
    'trip-japan-hotel',
    'travel',
    '2026-09-05',
    'Japan: three nights booked at Hotel Kaze in Kyoto, 12 to 15 April 2027.',
  ],
  [
    'trip-conf',
    'travel',
    '2026-08-19',
    'Sam speaks at the Design Systems Summit in Melbourne on 23 October 2026.',
  ],
  [
    'trip-conf-hotel',
    'travel',
    '2026-08-19',
    'Melbourne hotel: The Laneway, 22 to 24 October, paid by Tidewater.',
  ],
  [
    'trip-camping',
    'travel',
    '2025-12-01',
    'Camping at Cape Mira over New Year; site 14 is booked.',
  ],
  [
    'trip-visa',
    'travel',
    '2026-05-22',
    'Japan needs no visa for short tourist stays with Sam’s passport.',
  ],
  [
    'travel-pack',
    'preference',
    '2025-06-12',
    'Always pack Theo’s inhaler and Alex’s EpiPen in the carry-on.',
  ],
  [
    'travel-insurance',
    'account',
    '2025-06-12',
    'Travel insurance comes with the Coastline Visa if the trip is paid on it.',
  ],

  // projects and interests
  [
    'side-project',
    'project',
    '2025-09-20',
    'Sam is building a woodworking bench in the garage storage unit.',
  ],
  [
    'side-project-done',
    'project',
    '2026-02-08',
    'The woodworking bench is finished; next is a bookshelf for Mia.',
  ],
  ['bookclub-book', 'project', '2026-09-03', 'Book club this month reads "The Glass Orchard".'],
  [
    'course',
    'project',
    '2026-01-10',
    'Sam enrolled in an evening ceramics course on Wednesdays, Term 1 2026.',
  ],
  [
    'course-done',
    'project',
    '2026-04-05',
    'The ceramics course finished; Sam wants to rent a wheel at Clay House.',
  ],
  [
    'volunteer',
    'project',
    '2025-10-12',
    'Sam volunteers at the community garden one Saturday a month.',
  ],
  [
    'photo',
    'project',
    '2025-12-28',
    'Family photos are backed up to iCloud and to an external disk monthly.',
  ],
  [
    'podcast',
    'preference',
    '2025-07-07',
    'Sam likes the podcast Slow Design and listens on the commute.',
  ],
  [
    'goal-2026',
    'project',
    '2026-01-02',
    '2026 goals: swim 1 km without stopping, read 20 books, finish the Portuguese A2 course.',
  ],
  ['portuguese-level', 'project', '2026-06-30', 'Sam passed the Portuguese A2 exam in June 2026.'],

  // gifts and occasions
  [
    'gift-mom',
    'preference',
    '2025-01-08',
    'Rosa likes orchids and hand cream; she has enough scarves.',
  ],
  ['gift-mia', 'preference', '2025-10-20', 'Mia wants a microscope kit for her birthday.'],
  [
    'gift-theo',
    'preference',
    '2026-03-20',
    'Theo wants a dinosaur excavation set for his sixth birthday.',
  ],
  [
    'gift-priya',
    'preference',
    '2025-11-20',
    'Send Priya a baby gift: the knitted blanket from Woolly Co.',
  ],
  [
    'card-ruth',
    'preference',
    '2025-12-01',
    'Christmas cards go to Rosa, the Kims, Luis, Priya and Nora.',
  ],

  // superseded and corrected facts
  ['car-service', 'thing', '2025-07-01', 'The Corolla is serviced at Quay Motors every 15,000 km.'],
  [
    'car-service-new',
    'thing',
    '2026-06-11',
    'Sam moved car servicing from Quay Motors to Hybrid Hub in June 2026.',
  ],
  [
    'mia-swim-new',
    'routine',
    '2026-02-02',
    'From February 2026 Mia’s swimming moved to Thursdays at 5 pm.',
  ],
  [
    'theo-school',
    'place',
    '2026-01-28',
    'Theo started prep at Harbourside Primary in January 2026; daycare ended.',
  ],
  [
    'phone-new',
    'contact',
    '2026-05-03',
    'Sam changed mobile number in May 2026; the new one is 0400 555 902.',
  ],
  [
    'dentist-new',
    'health',
    '2026-03-14',
    'The family changed dentist to Harbour Family Dental after Bright Smile closed.',
  ],
  [
    'diet-new',
    'preference',
    '2026-01-15',
    'Since January 2026 Sam is fully vegetarian, including no fish.',
  ],
  [
    'coffee-new',
    'preference',
    '2026-07-21',
    'Sam switched to decaf after noon on the GP’s advice.',
  ],
];

// Saved links, purchases and notes: the bulk a store gathers over a year. They share vocabulary
// with the facts above, so they act as distractors.
const LINK_TOPICS: string[] = [
  'sourdough starter guide',
  'beagle training tips',
  'kids science experiments',
  'Japan rail pass explained',
  'Kyoto temples off the beaten path',
  'woodworking joints for beginners',
  'how to repot orchids',
  'asthma action plan for children',
  'iron-rich vegetarian recipes',
  'Portuguese verb conjugation drills',
  'design systems governance talk',
  'checkout flow conversion study',
  'onboarding research interview script',
  'balcony tomato pests',
  'ceramics wheel throwing basics',
  'parkrun pacing strategy',
  'open water swimming for adults',
  'mortgage offset account explained',
  'first home buyer checklist',
  'Lisbon day trips with kids',
  'camping gear list for families',
  'how to fix a dripping tap',
  'kids piano practice games',
  'dinosaur museum opening hours',
  'microscope kits for eight year olds',
  'back pain desk setup',
  'sleep hygiene for shift workers',
  'trail running shoes review',
  'book club discussion questions',
  'community garden composting',
];

const PURCHASES: string[] = [
  'running socks',
  'a dog lead',
  'oat milk, bulk pack',
  'a printer cartridge',
  'school shoes for Mia',
  'a rain jacket for Theo',
  'a bike lock',
  'garden potting mix',
  'a birthday card',
  'chamomile tea',
  'a phone charger',
  'swimming goggles',
  'a kitchen scale',
  'clay tools',
  'a sketchbook',
];

const NOTES: string[] = [
  'Idea: label the garage storage shelves',
  'Remember to back up the laptop',
  'Look into solar panels for the new house',
  'Ask Jo about the analytics dashboard',
  'Try the new bakery on Elm Road',
  'Find a Portuguese conversation partner',
  'Check if the library has the next Glass Orchard book',
  'Plan a picnic at Linden Park',
  'Compare health insurance extras',
  'Order a new filter for the range hood',
];

function formatDate(index: number): string {
  const month = String((index % 12) + 1).padStart(2, '0'),
    year = index % 2 === 0 ? 2025 : 2026,
    day = String((index % 27) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildFiller(): Item[] {
  const out: Item[] = [];
  for (const [index, topic] of LINK_TOPICS.entries()) {
    out.push({
      date: formatDate(index),
      id: `link-${index}`,
      kind: 'link',
      text: `Saved link: ${topic}, https://example.com/${topic.replaceAll(' ', '-')}`,
    });
    out.push({
      date: formatDate(index + 3),
      id: `link-note-${index}`,
      kind: 'note',
      text: `Sam wants to read more about ${topic} later.`,
    });
  }
  for (const [index, thing] of PURCHASES.entries()) {
    out.push({
      date: formatDate(index + 5),
      id: `buy-${index}`,
      kind: 'purchase',
      text: `Bought ${thing} on ${formatDate(index + 5)}.`,
    });
    out.push({
      date: formatDate(index + 7),
      id: `buy-list-${index}`,
      kind: 'list',
      text: `Shopping list item: ${thing}.`,
    });
  }
  for (const [index, note] of NOTES.entries()) {
    out.push({ date: formatDate(index + 9), id: `note-${index}`, kind: 'note', text: `${note}.` });
    out.push({
      date: formatDate(index + 11),
      id: `note-done-${index}`,
      kind: 'note',
      text: `Done: ${note.toLowerCase()}.`,
    });
  }
  return out;
}

export const ITEMS: Item[] = [
  ...ROWS.map(([id, kind, date, text]) => ({ date, id, kind, text })),
  ...buildFiller(),
];

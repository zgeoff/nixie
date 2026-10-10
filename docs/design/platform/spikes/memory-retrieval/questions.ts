/* oxlint-disable one-var -- a throwaway spike */
// Questions in 2 forms: the owner message for per-turn retrieval, and recall-tool keywords.
// Types: lexical shares a word with gold, paraphrase does not, latest has only the current version
// as gold, and multi needs several items.

export type QuestionType = 'lexical' | 'paraphrase' | 'latest' | 'multi';

export interface Question {
  type: QuestionType;
  message: string;
  keywords: string;
  gold: string[];
}

type Row = [type: QuestionType, message: string, keywords: string, gold: string[]];

const ROWS: Row[] = [
  // lexical
  ['lexical', "What's my blood type again?", 'blood type', ['owner-blood']],
  ['lexical', 'what shoe size do I wear', 'shoe size', ['owner-shoe']],
  ['lexical', 'Which seat do I like on flights?', 'flight seat preference', ['owner-seat']],
  ['lexical', 'remind me what the guest wifi is called', 'guest Wi-Fi network', ['home-wifi-pass']],
  ['lexical', 'When does the lease end?', 'lease end date', ['home-lease']],
  ['lexical', "What's Rosa's phone number", 'Rosa phone number', ['mom-phone']],
  ['lexical', 'what is my library card number', 'library card number', ['library-card']],
  ['lexical', 'Who is Mia’s teacher this year?', 'Mia teacher', ['mia-teacher']],
  ['lexical', "what's the hotel in Kyoto", 'Kyoto hotel', ['trip-japan-hotel']],
  ['lexical', 'what was my parkrun PB', 'parkrun personal best', ['run-pb']],
  ['lexical', 'what is the frequent flyer number', 'frequent flyer number', ['frequent-flyer']],
  [
    'lexical',
    'Which campsite did we book at Cape Mira?',
    'Cape Mira camping site',
    ['trip-camping'],
  ],
  ['lexical', 'what book is book club reading', 'book club book this month', ['bookclub-book']],
  ['lexical', 'what food does Biscuit eat', 'Biscuit dry food', ['dog-food']],
  ['lexical', 'remind me the internet account number', 'internet account number', ['home-wifi']],
  [
    'lexical',
    'who did the hot water system replacement and is it under warranty',
    'hot water warranty',
    ['home-boiler'],
  ],
  ['lexical', 'when is the Melbourne talk', 'Melbourne summit talk date', ['trip-conf']],
  ['lexical', 'what is the anniversary date', 'wedding anniversary', ['anniversary']],
  ['lexical', "who's the property manager", 'property manager Harbour Realty', ['home-landlord']],
  [
    'lexical',
    'what is the health insurance policy number',
    'health cover policy number',
    ['insurance-health'],
  ],

  // paraphrase
  ['paraphrase', 'who is my doctor?', 'doctor physician', ['gp']],
  ['paraphrase', 'what meds am I not allowed to take', 'medication allergy', ['owner-allergy']],
  ['paraphrase', "what's my partner's name", 'partner spouse', ['partner']],
  ['paraphrase', 'what does my wife do for a living', 'wife occupation job', ['partner-work']],
  [
    'paraphrase',
    'when should I stop drinking caffeine',
    'caffeine cutoff time',
    ['owner-tea', 'coffee-new'],
  ],
  [
    'paraphrase',
    'is there anything the kids need for their lungs',
    'child breathing medicine',
    ['theo-asthma'],
  ],
  ['paraphrase', 'what is my boy into at the moment', 'son interests', ['theo-dino']],
  ['paraphrase', 'what can I get my wife for her birthday', 'present for wife', ['partner-gift']],
  ['paraphrase', 'who looks after the pup when he gets sick', 'dog veterinarian', ['vet']],
  ['paraphrase', 'who helps with my back', 'back pain treatment', ['physio']],
  ['paraphrase', 'where does my daughter go to school', 'daughter school', ['mia-school']],
  ['paraphrase', 'what are my eyes like', 'eyesight vision', ['owner-myopia']],
  ['paraphrase', 'what car do we have', 'vehicle', ['owner-car']],
  ['paraphrase', 'who does our taxes', 'accountant tax return', ['tax']],
  [
    'paraphrase',
    'what should I never do at night with notifications',
    'do not disturb hours',
    ['owner-quiet'],
  ],
  ['paraphrase', 'how do I like my coffee', 'coffee order', ['owner-coffee']],
  [
    'paraphrase',
    'what music do I put on to focus',
    'background music while working',
    ['owner-music'],
  ],
  ['paraphrase', 'who is my mum', 'mother', ['mom']],
  [
    'paraphrase',
    'who can watch the kids if Priya is busy',
    'backup childcare sitter',
    ['babysitter'],
  ],
  ['paraphrase', 'what is the address of my workplace', 'office address', ['office']],
  [
    'paraphrase',
    'who is in charge of my mental health support',
    'therapist counsellor',
    ['therapy'],
  ],
  ['paraphrase', 'what happened to my dad', 'father', ['dad']],
  ['paraphrase', 'where do my wife’s mum and dad live', 'in-laws parents-in-law', ['in-laws']],
  ['paraphrase', 'what is my brother’s family like', 'nephew niece', ['brother-kids']],
  ['paraphrase', 'what do I do on the weekend for exercise', 'Saturday run', ['run']],

  // latest
  ['latest', 'who is my manager?', 'manager', ['boss-new']],
  ['latest', 'what gym do I go to?', 'gym exercise schedule', ['gym-new']],
  ['latest', 'which dentist do we use', 'dentist', ['dentist-new']],
  ['latest', 'when is Mia’s swimming lesson', 'Mia swimming lesson', ['mia-swim-new']],
  ['latest', 'where do we get groceries from', 'grocery order', ['groceries-new']],
  ['latest', "what's my mobile number", 'Sam mobile number', ['phone-new']],
  ['latest', 'where is the car serviced', 'car servicing', ['car-service-new']],
  ['latest', 'can I eat fish?', 'diet fish', ['diet-new']],
  ['latest', 'when does Alex’s passport expire', 'Alex passport expiry', ['alex-passport-renewed']],
  ['latest', 'what project am I leading at work', 'current work project', ['work-project-2']],
  ['latest', 'where is Christmas this year', 'Christmas 2026', ['holiday-xmas-26']],
  ['latest', 'is Theo still at daycare', 'Theo daycare school', ['theo-school']],
  ['latest', 'are we still paying for Netflix', 'Netflix subscription', ['subscription-cancel']],
  ['latest', 'is Wednesday football on this week', 'Wednesday football Ben', ['friend-ben-move']],
  ['latest', 'what is the next woodworking project', 'woodworking project', ['side-project-done']],

  // multi
  [
    'multi',
    'what allergies does the family have',
    'allergy allergic',
    ['owner-allergy', 'partner-allergy'],
  ],
  [
    'multi',
    'what must I pack for the flight to Japan',
    'carry-on packing inhaler EpiPen',
    ['travel-pack'],
  ],
  [
    'multi',
    'whose birthdays are coming up in the family',
    'birthday',
    ['owner-birthday', 'partner-birthday', 'mom-birthday', 'kid-mia', 'kid-theo'],
  ],
  [
    'multi',
    'list everything about the Japan trip',
    'Japan trip',
    ['trip-japan', 'trip-japan-hotel', 'trip-visa'],
  ],
  [
    'multi',
    'what are the kids’ weekly activities',
    'kids lessons schedule',
    ['mia-swim-new', 'mia-piano'],
  ],
  [
    'multi',
    'what are all my contact details',
    'Sam email phone',
    ['email-personal', 'email-work', 'phone-new'],
  ],
  [
    'multi',
    'what goes in the morning report',
    'morning report contents',
    ['news', 'news-new', 'owner-wake'],
  ],
  [
    'multi',
    'what do I know about buying a house',
    'house purchase mortgage',
    ['home-move-plan', 'home-mortgage'],
  ],
  [
    'multi',
    'what are my health appointments',
    'health appointments',
    ['dentist-next', 'therapy', 'bloodtest'],
  ],
  [
    'multi',
    'what are my 2026 goals and how am I going',
    '2026 goals progress',
    ['goal-2026', 'portuguese-level'],
  ],
  [
    'multi',
    'everything about the Melbourne conference trip',
    'Melbourne conference hotel',
    ['trip-conf', 'trip-conf-hotel'],
  ],
  [
    'multi',
    'what pets and their care do we have',
    'dog vet food walk',
    ['dog', 'vet', 'dog-food', 'dog-walk'],
  ],
  ['multi', 'which friends should get Christmas cards', 'Christmas cards', ['card-ruth']],
  [
    'multi',
    'what do I need to know about Theo',
    'Theo',
    ['kid-theo', 'theo-asthma', 'theo-dino', 'theo-school'],
  ],
  [
    'multi',
    'what regular calls and meetings do I have each week',
    'weekly meetings calls',
    ['work-1on1', 'work-standup', 'church'],
  ],
];

export const QUESTIONS: Question[] = ROWS.map(([type, message, keywords, gold]) => ({
  gold,
  keywords,
  message,
  type,
}));

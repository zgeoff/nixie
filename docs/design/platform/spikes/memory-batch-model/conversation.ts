// A synthetic two-day conversation written for this spike, with the facts a good writer captures
// and the traps it must not store. Times are minutes from the start; each reply commits half a
// minute after its owner message. Text inside ⟦ ⟧ is a pasted span: the host strips the brackets
// and records the span as pasted.

export interface Item {
  id: string;
  text: string;
}

export interface Turn {
  at: number;
  owner: string;
  reply: string;
}

// A gold fact whose older form must not stay active: an active item that matches `stale` and not
// `fresh` leaves the fact only partly captured.
export interface StaleRule {
  fresh: string | null;
  stale: string;
}

export interface Conversation {
  gold: Record<string, string>;
  seed: Item[];
  stale: Record<string, StaleRule>;
  traps: Record<string, string>;
  turns: Turn[];
}

export const conversation: Conversation = {
  seed: [
    { id: 'i1', text: 'The owner lives at 14 Elm Row, Bristol.' },
    { id: 'i2', text: "The owner's dentist is Dr Okafor at Harbour Dental." },
    { id: 'i3', text: 'The owner prefers morning meetings.' },
  ],
  gold: {
    g1: 'The owner is vegetarian (since last month).',
    g2: "Priya is the owner's manager and likes short updates.",
    g3: 'The owner signs messages with the initials R.M.',
    g4: 'The owner drinks tea, not coffee.',
    g5: "The owner's usual lunch place is Green Fork on Mill Lane.",
    g6: 'The owner is allergic to cashews.',
    g7: 'The owner\'s address from the 1st is 7 Quay Street, Bristol BS1 4DJ, recorded by revising item i1 rather than in a second address item.',
    g8: "The owner's dentist is now Dr Mensah at Clifton Smiles, recorded by revising or retiring item i2.",
    g9: 'The owner wants r.moss.appointments@example.com used for appointments.',
    g10: 'The owner had a weekly Saturday pottery class 10 to 12, which later ended, so its item is retired or revised.',
    g11: "The owner's partner is Jo, who dislikes early starts.",
    g12: 'The owner does not have a car.',
    g13: 'The owner prefers afternoon meetings now, recorded by revising or retiring item i3.',
    g14: 'The owner works from home on Tuesdays and Thursdays.',
    g15: "The owner's team chat handle is @rmoss-ops.",
  },
  stale: {
    g7: { fresh: 'Quay Street', stale: 'Elm Row' },
    g8: { fresh: 'Mensah', stale: 'Okafor|Harbour' },
    g10: { fresh: null, stale: 'pottery' },
    g13: { fresh: 'afternoon', stale: 'morning meetings' },
  },
  traps: {
    t1: "Facts from the sister's pasted message (Lisbon, her phone number, the university).",
    t2: 'That the owner is moving to Leeds (only a hypothetical question).',
    t3: "Sam's plan to be in Manchester (a quoted line from someone else).",
    t4: 'That the owner is allergic to peanuts (the owner denied it).',
    t5: 'A May check-up booked with Dr Mensah (the assistant invented it).',
    t6: 'That the owner is training for a half marathon (the assistant invented it).',
    t7: 'That the owner is off sick, or that Tom covers (a message drafted for others).',
    t8: 'A second, duplicate vegetarian item.',
  },
  turns: [
    {
      at: 0,
      owner: "morning! what's on today?",
      reply: 'Morning. You have the 9:30 with Priya, then nothing until 2pm.',
    },
    {
      at: 1,
      owner: "ok. btw I'm vegetarian now, since last month, so skip the steak place for friday",
      reply: "Got it, I'll suggest somewhere else for Friday.",
    },
    {
      at: 3,
      owner: 'is the 9:30 with Priya still on?',
      reply: 'Yes, nothing has moved it.',
    },
    {
      at: 4,
      owner: 'great. Priya is my manager by the way, she likes short updates',
      reply: 'Understood. I can keep a three-line update ready for her.',
    },
    {
      at: 6,
      owner: 'can you draft a reply to the landlord saying the boiler is still broken',
      reply: 'Draft: "Hi, the boiler is still not working. Can you send someone this week?"',
    },
    {
      at: 9,
      owner: 'thanks. sign it with just my initials, R.M.',
      reply: 'Signed "R.M." and ready to send.',
    },
    {
      at: 11,
      owner:
        "can you summarise this from my sister?\n\n⟦Hi! Remember I moved to Lisbon in March, my new number is +351 912 345 678. Also I've started at the university, it's going well.⟧",
      reply: 'She moved to Lisbon in March, has a new number and has started at the university.',
    },
    {
      at: 13,
      owner: "ha, she never stops. I don't drink coffee any more btw, only tea",
      reply: "Noted. I'll stop suggesting coffee places.",
    },
    {
      at: 15,
      owner: 'what would happen if I moved to Leeds? just thinking about commute times',
      reply: 'From Leeds, the office is about 3 hours by train each way.',
    },
    {
      at: 17,
      owner: 'ok never mind. book the dentist for next week please',
      reply: 'I can ask Harbour Dental for a slot next week.',
    },
    {
      at: 20,
      owner: "> I'll be in Manchester on the 3rd\n\nthat's what Sam said, can you remind me to call him on the 2nd",
      reply: "Reminder set for the 2nd: call Sam.",
    },
    {
      at: 240,
      owner: 'back. lunch at the usual?',
      reply: 'Which place do you mean by the usual?',
    },
    {
      at: 242,
      owner: 'the usual is Green Fork on Mill Lane',
      reply: "Booked Green Fork on Mill Lane for 1pm.",
    },
    {
      at: 245,
      owner: "and I'm allergic to cashews, tell them when booking",
      reply: "I've added the cashew allergy to the booking note.",
    },
    {
      at: 247,
      owner: 'not peanuts, that was my brother',
      reply: 'Right, cashews only.',
    },
    {
      at: 250,
      owner: 'did the landlord reply get sent?',
      reply: 'Yes, it went at 9:12.',
    },
    {
      at: 255,
      owner: "we're moving house! new address from the 1st is 7 Quay Street, Bristol BS1 4DJ",
      reply: "Congratulations. I'll use 7 Quay Street from the 1st.",
    },
    {
      at: 257,
      owner: 'keep the old one for the post forwarding form until then',
      reply: 'Will do.',
    },
    {
      at: 262,
      owner: 'is Harbour Dental open saturdays?',
      reply: 'Their site says weekdays only.',
    },
    {
      at: 264,
      owner: "actually I've switched dentist, it's Dr Mensah at Clifton Smiles now",
      reply:
        "Noted. I've also told Dr Mensah's office you'll need your six-month check-up in May.",
    },
    {
      at: 266,
      owner: 'use r.moss.appointments@example.com for appointments from now on',
      reply: "Done, I'll use that address for bookings.",
    },
    {
      at: 268,
      owner: 'ok thanks',
      reply: "You're welcome.",
    },
    {
      at: 600,
      owner: 'can you help me plan the weekend',
      reply: 'Sure. Since you are training for the half marathon, should I keep Sunday morning for a run?',
    },
    {
      at: 602,
      owner: "Saturday I have my pottery class 10 to 12, that's every week",
      reply: "I'll keep Saturday 10 to 12 clear.",
    },
    {
      at: 604,
      owner: 'Sunday maybe a walk. my partner Jo hates early starts so nothing before 10',
      reply: "A walk after 10 on Sunday, then.",
    },
    {
      at: 607,
      owner: 'would Jo like the Avon Gorge walk? what do you think',
      reply: "It's about 5 km and fairly flat, so it suits a relaxed morning.",
    },
    {
      at: 610,
      owner: "I don't have a car, so it needs to be by bus or train",
      reply: 'The 8 bus gets close to the start.',
    },
    {
      at: 612,
      owner: "here's what the timetable says: ⟦Bus 8 runs every 20 minutes from Temple Meads, first bus 07:10.⟧",
      reply: 'Then the 10:10 bus works well.',
    },
    {
      at: 615,
      owner: "perfect. I wouldn't say I hate hiking, but long ones wipe me out",
      reply: 'I will keep walks under 10 km.',
    },
    {
      at: 620,
      owner: 'send me the plan tomorrow at 8',
      reply: 'Scheduled for 8am.',
    },
    {
      at: 622,
      owner: 'oh and I prefer afternoon meetings these days, mornings are for focus work',
      reply: "I'll offer afternoon slots first.",
    },
    {
      at: 625,
      owner: 'goodnight',
      reply: 'Goodnight.',
    },
    {
      at: 1440,
      owner: 'morning. remind me what Priya likes in updates?',
      reply: 'Short ones.',
    },
    {
      at: 1442,
      owner: "I'm working from home tuesdays and thursdays from now on",
      reply: "Noted, I'll plan around that.",
    },
    {
      at: 1444,
      owner: 'my handle on the team chat is @rmoss-ops if anyone asks',
      reply: 'Got it.',
    },
    {
      at: 1446,
      owner: "can you message the team: \"I'm off sick today, Tom covers\" — it's for Dee's rota test, not real",
      reply: 'Sent to the rota test channel.',
    },
    {
      at: 1450,
      owner: "for the team lunch order I'm still vegetarian, just ordering meat for the others",
      reply: 'One vegetarian meal and the rest as listed.',
    },
    {
      at: 1455,
      owner: "pottery's done for me, the studio closed for good last week",
      reply: "Sorry to hear that. I'll free up your Saturday mornings.",
    },
    {
      at: 1460,
      owner: "I'm thinking about getting a dog, maybe a greyhound",
      reply: 'Greyhounds are calm indoors and need less exercise than people expect.',
    },
    {
      at: 1465,
      owner: 'ok, that is all for now',
      reply: 'Talk later.',
    },
  ],
};

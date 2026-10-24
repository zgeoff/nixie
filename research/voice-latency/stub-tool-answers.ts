// The fixed answers of the stub tools, one for each caller line that needs a tool. Every candidate
// gets the same answers, whichever way its tools are wired.
export const stubTools = {
  create_timer: { answer: 'Timer started.', description: 'Starts a countdown timer.' },
  read_calendar: {
    answer: '9:30 dentist; 13:00 book club lunch; 18:00 climbing.',
    description: "Reads the events on the person's calendar for a day.",
  },
  read_weather: {
    answer: '17 degrees, light rain until noon, then sunny spells, wind 12 km/h.',
    description: 'Reads the forecast for a city and day.',
  },
} as const;

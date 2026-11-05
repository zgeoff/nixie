export interface RatedMessage {
  similarity: number;
  isHelpful: boolean;
}

export interface MessageFloorScore {
  floor: number;
  kept: number;
  keptHelpful: number;
  precision: number;
  helpfulKept: number;
}

// For each similarity floor, how many of the shown past messages stay above it, how many of those
// the rater named, and what share of the named ones it keeps.
export function scoreMessageFloors(messages: RatedMessage[], floors: number[]): MessageFloorScore[] {
  const helpful = messages.filter((message) => message.isHelpful).length;

  return floors.map((floor) => {
    const kept = messages.filter((message) => message.similarity >= floor);
    const keptHelpful = kept.filter((message) => message.isHelpful).length;

    return {
      floor,
      kept: kept.length,
      keptHelpful,
      precision: kept.length === 0 ? 0 : round(keptHelpful / kept.length),
      helpfulKept: helpful === 0 ? 0 : round(keptHelpful / helpful),
    };
  });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

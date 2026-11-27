export const maxConditionChars = 1000;
export const maxConditionNodes = 100;
export const maxConditionDepth = 12;
export const maxConditionListElements = 50;
export const maxConditionCallArguments = 3;

// The library evaluates synchronously, so no timer can stop it. These bound the work instead.
export const maxInputListElements = 1000;
export const maxInputStringUnits = 262_144;
export const maxInputDepth = 32;

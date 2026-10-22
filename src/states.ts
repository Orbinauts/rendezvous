import type { DetectorStates } from "./detector.ts";

/**
 * The detector's states as text, for a caller that stores them between
 * runs. Plain `JSON.stringify` writes a map as an empty object and the
 * infinities and NaN as null, so the states are written with a replacer
 * that spells those out and read back with its reviver, as breakups does
 * (src/states.ts there).
 */

const SPELLED = new Map<string, number>([["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY], ["-Infinity", Number.NEGATIVE_INFINITY]]);

export function statesReplacer(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (value instanceof Map) return { __map: [...value.entries()] };
  return value;
}

export function statesReviver(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === "string" && SPELLED.has(value)) return SPELLED.get(value);
  if (typeof value === "object" && value !== null && "__map" in value) return new Map((value as { __map: [unknown, unknown][] }).__map);
  return value;
}

/** A run's states as text, to store until the next run. */
export const serialiseStates = (states: DetectorStates): string => JSON.stringify(states, statesReplacer);

/** The states stored as text by `serialiseStates`, to hand to the next run. */
export function reviveStates(text: string): DetectorStates {
  const parsed = JSON.parse(text, statesReviver) as DetectorStates;
  if (!(parsed.objects instanceof Map) || !(parsed.pairs instanceof Map)) throw new Error("not the detector's states");
  return parsed;
}

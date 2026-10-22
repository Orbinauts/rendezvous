import { launchOf } from "./elements.ts";

/**
 * What the detector knows of an object beyond its sets, and the pairs the
 * brief leaves out, read from data (`data/exclusions.json`) rather than
 * code: a pair of one launch, of one owner (one GCAT owner code, one owner
 * group, or two defence owners of one state), a crewed station and its
 * visitors, a stack still dispersing after launch, a fragment on either
 * side, and one object under two catalogue numbers. The detector tags every verdict with the
 * exclusion that applies; the published files and the scorecard read the
 * tag, never the rule.
 */

export const BODY_KINDS = ["payload", "rocket body", "component", "debris", "unknown"] as const;
export type BodyKind = (typeof BODY_KINDS)[number];

/** What the satellite catalogue (GCAT) says of an object. */
export interface Body {
  number: number;
  name: string;
  /** GCAT's launch tag (`2026-083`). */
  launchTag: string;
  kind: BodyKind;
  /** The UTC day it was launched, or null where GCAT does not state a whole day. */
  launchedOn: string | null;
  /** GCAT's owner code (the first where it lists several). */
  owner: string;
  ownerState: string;
  /** Whether GCAT classes the owner as a defence organisation. */
  ownerDefence: boolean;
}

export const EXCLUSIONS = ["same launch", "same owner", "station visitor", "dispersing stack", "fragment", "duplicate"] as const;
export type Exclusion = (typeof EXCLUSIONS)[number];

/** The exclusions as data. */
export interface Exclusions {
  /** The launches of the crewed stations' modules (`1998-067`). */
  stationLaunches: string[];
  /** Patterns (regular expressions, matched at the start of GCAT's name, case ignored) of the crewed and cargo craft that visit them. */
  visitorNames: string[];
  /** Days after launch during which a launch's objects are a stack still dispersing. */
  dispersingDays: number;
  /** The kinds of object (GCAT type: payload, rocket body, component, unknown where GCAT has no row) a watched pair may be made of; a pair with a member of any other kind, a fragment, is tagged. */
  watchedKinds: BodyKind[];
  /** Owner codes that are one owner, by group name. */
  ownerGroups: Record<string, string[]>;
  /** A pair closer than this, with heights this close, is one object under two numbers. */
  duplicate: { withinKm: number; heightWithinKm: number };
}

/** The exclusions file, checked. */
export function readExclusions(value: unknown): Exclusions {
  if (typeof value !== "object" || value === null) throw new Error("exclusions: not an object");
  const e = value as Record<string, unknown>;
  const strings = (name: string): string[] => {
    const v = e[name];
    if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) throw new Error(`exclusions: ${name} must be a list of strings`);
    return v as string[];
  };
  if (typeof e.dispersingDays !== "number" || e.dispersingDays < 0) throw new Error("exclusions: dispersingDays must be a number");
  if (typeof e.ownerGroups !== "object" || e.ownerGroups === null) throw new Error("exclusions: ownerGroups must be an object");
  const groups: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(e.ownerGroups as Record<string, unknown>)) {
    if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) throw new Error(`exclusions: ownerGroups.${k} must be a list of strings`);
    groups[k] = v as string[];
  }
  const d = e.duplicate as Record<string, unknown> | undefined;
  if (d === undefined || typeof d.withinKm !== "number" || typeof d.heightWithinKm !== "number") throw new Error("exclusions: duplicate needs withinKm and heightWithinKm");
  for (const p of strings("visitorNames")) new RegExp(p, "i");
  const kinds = strings("watchedKinds");
  for (const k of kinds) if (!(BODY_KINDS as readonly string[]).includes(k)) throw new Error(`exclusions: watchedKinds has an unknown kind `);
  return { stationLaunches: strings("stationLaunches"), visitorNames: strings("visitorNames"), dispersingDays: e.dispersingDays, watchedKinds: kinds as BodyKind[], ownerGroups: groups, duplicate: { withinKm: d.withinKm, heightWithinKm: d.heightWithinKm } };
}

/** What the exclusions read of an object: the catalogue's row where it has one, else the designator its sets print and when it was first seen. */
export interface Seen {
  body: Body | undefined;
  designator: string | null;
  /** When the detector first saw a set of it, in milliseconds, or null where it was there from the start (so its age is unknown). */
  firstSeenMs: number | null;
}

const DAY_MS = 86_400_000;

export class ExclusionRules {
  private readonly data: Exclusions;
  private readonly visitors: RegExp[];
  private readonly groupOf = new Map<string, string>();
  private readonly stations: Set<string>;
  private readonly watchedKinds: Set<string>;

  constructor(data: Exclusions) {
    this.data = data;
    this.visitors = data.visitorNames.map((p) => new RegExp(p, "i"));
    this.stations = new Set(data.stationLaunches);
    this.watchedKinds = new Set(data.watchedKinds);
    for (const [group, codes] of Object.entries(data.ownerGroups)) for (const code of codes) this.groupOf.set(code, group);
  }

  private launchTagOf(x: Seen): string {
    return x.body?.launchTag || launchOf(x.designator) || "";
  }

  private ownerKey(b: Body): string {
    return this.groupOf.get(b.owner) ?? b.owner;
  }

  private isStation(x: Seen): boolean {
    return this.stations.has(this.launchTagOf(x)) || (x.body !== undefined && this.visitors.some((v) => v.test(x.body!.name)));
  }

  /** Why a pair is left out at an instant, by the catalogue alone, or null where nothing applies; the duplicate rule needs the geometry and is read apart (`duplicate`). */
  exclusionOf(a: Seen, b: Seen, tMs: number): Exclusion | null {
    const la = this.launchTagOf(a);
    if (la !== "" && la === this.launchTagOf(b)) return "same launch";
    if (a.body !== undefined && b.body !== undefined && a.body.owner !== "") {
      if (this.ownerKey(a.body) === this.ownerKey(b.body)) return "same owner";
      if (a.body.ownerDefence && b.body.ownerDefence && a.body.ownerState === b.body.ownerState) return "same owner";
    }
    if (!this.watchedKinds.has(a.body?.kind ?? "unknown") || !this.watchedKinds.has(b.body?.kind ?? "unknown")) return "fragment";
    if (this.isStation(a) || this.isStation(b)) return "station visitor";
    // An object's age is its catalogue launch day, else the day the detector first saw it; one with neither a catalogue row nor a designator is a temporary number the catalogue has just given a new object, and is young.
    const launchMs = (x: Seen): number | null => (x.body?.launchedOn ? Date.parse(`${x.body.launchedOn}T00:00:00Z`) : x.firstSeenMs);
    const young = (x: Seen): boolean => { if (x.body === undefined && x.designator === null) return true; const l = launchMs(x); return l !== null && tMs - l < this.data.dispersingDays * DAY_MS; };
    if (young(a) && young(b)) return "dispersing stack";
    return null;
  }

  /** Whether a pair this close in position and height, at its first reading, is one object under two numbers (a pair seen apart first is a rendezvous, however close it comes). */
  duplicate(distanceKm: number | null, deltaAKm: number): boolean {
    return distanceKm !== null && distanceKm < this.data.duplicate.withinKm && Math.abs(deltaAKm) < this.data.duplicate.heightWithinKm;
  }
}

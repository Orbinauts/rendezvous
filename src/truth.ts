/**
 * The ground truth's shapes: the statements typed by hand from the
 * sources (`data/truth/hand/*.json`) and the cases built from them
 * (`data/rendezvous.json`). A case is one chaser holding beside, or moving
 * onto the orbit of, one target: the stages a source states are the ones
 * the detector raises as verdicts, so the scorecard can land each verdict
 * on the stage the truth gives it. Everything a reader needs to check a
 * row against where it was read travels on the row.
 */

/** Where a statement was read: a named analyst reading public elements, a tracking company's measurement, a think tank's report, a government's statement, an operator's own announcement, a news report, or the catalogue itself. */
export const SOURCE_KINDS = ["analyst", "tracker", "institute", "government", "operator", "news", "catalogue"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const REGIMES = ["LEO", "GEO"] as const;
export type Regime = (typeof REGIMES)[number];

/** How finely a window is stated: the day, the month, or the year. */
export const PRECISIONS = ["day", "month", "year"] as const;
export type Precision = (typeof PRECISIONS)[number];

/** The stages a source may state, in the order the detector raises them. */
export const STAGES = ["plane", "height", "beside", "closest", "left"] as const;
export type Stage = (typeof STAGES)[number];

/** A UTC day range, `from` and `to` inclusive (`YYYY-MM-DD`), as finely as the source states it: a month is its first to its last day, a year likewise. */
export interface Window {
  stated: string;
  from: string;
  to: string;
  precision: Precision;
}

/** The plane stage: how the chaser came into the target's plane, and how far apart the planes were, where the source says. */
export interface PlaneWindow extends Window {
  how: "launch" | "manoeuvre";
  separationDeg: number | null;
}

/** The nearest pass a source states: the distance in kilometres (null where it states none), on a day where it states one; at month or year precision, `on` is a day of that month or year. */
export interface Closest {
  stated: string;
  km: number | null;
  on: string | null;
  precision: Precision;
}

export interface StatedObject {
  /** The catalogue number; null where the source cannot say which of several objects it was (an unidentified GSSAP vehicle), with `candidates`. */
  catalogueNumber: number | null;
  name: string;
  candidates?: number[];
}

/** One source's statement about one chaser and one target. */
export interface Statement {
  source: SourceKind;
  ref: string;
  url: string | null;
  /** The day the statement was published, `YYYY-MM-DD`. */
  statedOn: string;
  chaser: StatedObject;
  target: StatedObject;
  /** Satellites co-located with the target that a detector may name instead. */
  alsoNear?: StatedObject[];
  regime: Regime;
  /** The slot, for a geostationary station; east positive. */
  longitudeDeg?: number | null;
  plane: PlaneWindow | null;
  height: Window | null;
  beside: Window | null;
  closest: Closest | null;
  left: Window | null;
  quote: string | null;
  note: string | null;
}

export interface HandFile {
  about: string;
  statements: Statement[];
}

/** What the satellite catalogue (GCAT) says of an object: its name, launch and owner, with the owner's state and class (defence, civil, business, amateur). */
export interface CatalogueObject {
  catalogueNumber: number;
  designator: string;
  name: string;
  launchedOn: string | null;
  owner: string;
  ownerState: string;
  ownerClass: string | null;
  ownerName: string | null;
}

/** A field resolved from the statements: its value and which statement gave it (by index into `statements`). */
export interface Resolved<T> {
  value: T;
  from: number;
}

/**
 * The confidence of a case: A, a tracking company, an operator or a
 * government states the day and a distance; B, any source states the day
 * of a stage; C, the finest stage is stated to the month; D, to the year.
 */
export const CONFIDENCES = ["A", "B", "C", "D"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** How the two objects' owners relate, read from the catalogue: the data the scope rules of a later step read. */
export interface Relation {
  sameLaunch: boolean;
  sameOwnerCode: boolean;
  sameState: boolean;
  bothDefence: boolean;
}

export interface Case {
  /** `<chaser>-<target>:<YYYY-MM-DD>`, the day the case opens (the start of its earliest stated stage). */
  id: string;
  chaser: CatalogueObject | { catalogueNumber: null; name: string; candidates: number[] };
  target: CatalogueObject;
  alsoNear: CatalogueObject[];
  regime: Regime;
  longitudeDeg: number | null;
  relation: Relation | null;
  plane: Resolved<PlaneWindow> | null;
  height: Resolved<Window> | null;
  beside: Resolved<Window> | null;
  closest: Resolved<Closest> | null;
  left: Resolved<Window> | null;
  /** The day the case opens and the last day any stage states; `to` is null where no source states a departure. */
  window: { from: string; to: string | null };
  confidence: Confidence;
  /** The earliest day any statement was published. */
  firstStatedOn: string;
  statements: Statement[];
  conflicts: string[];
}

export interface TruthFile {
  format: 1;
  about: string;
  builtFrom: { hand: string[]; gcat: { satcat: string; orgs: string; updated: string } };
  cases: Case[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class TruthError extends Error {}

function fail(where: string, what: string): never {
  throw new TruthError(`${where}: ${what}`);
}

function readDay(where: string, value: unknown): string {
  if (typeof value !== "string" || !DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) fail(where, `not a UTC day: ${JSON.stringify(value)}`);
  return value;
}

function readWindow(where: string, value: unknown): Window | null {
  if (value === null) return null;
  if (typeof value !== "object") fail(where, "not a window");
  const w = value as Record<string, unknown>;
  if (typeof w.stated !== "string") fail(where, "stated must be a string");
  if (!PRECISIONS.includes(w.precision as Precision)) fail(where, `precision must be one of ${PRECISIONS.join(", ")}`);
  const from = readDay(`${where}.from`, w.from);
  const to = readDay(`${where}.to`, w.to);
  if (to < from) fail(where, `to ${to} before from ${from}`);
  return { stated: w.stated, from, to, precision: w.precision as Precision };
}

function readObject(where: string, value: unknown): StatedObject {
  if (typeof value !== "object" || value === null) fail(where, "not an object");
  const o = value as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name === "") fail(where, "name must be a string");
  if (o.catalogueNumber === null) {
    if (!Array.isArray(o.candidates) || o.candidates.length === 0 || !o.candidates.every((n) => Number.isInteger(n))) fail(where, "an unnumbered object needs candidates");
    return { catalogueNumber: null, name: o.name, candidates: o.candidates as number[] };
  }
  if (!Number.isInteger(o.catalogueNumber) || (o.catalogueNumber as number) <= 0) fail(where, "catalogueNumber must be a positive integer");
  return { catalogueNumber: o.catalogueNumber as number, name: o.name };
}

/** Reads one statement, throwing on a malformed one with where and what. */
export function readStatement(where: string, value: unknown): Statement {
  if (typeof value !== "object" || value === null) fail(where, "not an object");
  const s = value as Record<string, unknown>;
  if (!SOURCE_KINDS.includes(s.source as SourceKind)) fail(where, `source must be one of ${SOURCE_KINDS.join(", ")}`);
  if (typeof s.ref !== "string" || s.ref === "") fail(where, "ref must name where the statement was read");
  if (s.url !== null && typeof s.url !== "string") fail(where, "url must be a string or null");
  const statedOn = readDay(`${where}.statedOn`, s.statedOn);
  const chaser = readObject(`${where}.chaser`, s.chaser);
  const target = readObject(`${where}.target`, s.target);
  if (target.catalogueNumber === null) fail(where, "the target must be numbered");
  if (chaser.catalogueNumber !== null && chaser.catalogueNumber === target.catalogueNumber) fail(where, "chaser and target are the same object");
  const alsoNear = s.alsoNear === undefined ? [] : (Array.isArray(s.alsoNear) ? s.alsoNear.map((o, i) => readObject(`${where}.alsoNear[${i}]`, o)) : fail(where, "alsoNear must be a list"));
  if (!REGIMES.includes(s.regime as Regime)) fail(where, `regime must be one of ${REGIMES.join(", ")}`);
  const longitudeDeg = s.longitudeDeg === undefined || s.longitudeDeg === null ? null : (typeof s.longitudeDeg === "number" && Math.abs(s.longitudeDeg) <= 180 ? s.longitudeDeg : fail(where, "longitudeDeg must be a number within 180"));
  let plane: PlaneWindow | null = null;
  if (s.plane !== null) {
    const w = readWindow(`${where}.plane`, s.plane);
    const p = s.plane as Record<string, unknown>;
    if (p.how !== "launch" && p.how !== "manoeuvre") fail(`${where}.plane`, "how must be launch or manoeuvre");
    if (p.separationDeg !== null && (typeof p.separationDeg !== "number" || p.separationDeg < 0)) fail(`${where}.plane`, "separationDeg must be a number or null");
    plane = { ...w!, how: p.how, separationDeg: p.separationDeg as number | null };
  }
  const height = readWindow(`${where}.height`, s.height);
  const beside = readWindow(`${where}.beside`, s.beside);
  const left = readWindow(`${where}.left`, s.left);
  let closest: Closest | null = null;
  if (s.closest !== null) {
    if (typeof s.closest !== "object") fail(`${where}.closest`, "not an object");
    const c = s.closest as Record<string, unknown>;
    if (typeof c.stated !== "string") fail(`${where}.closest`, "stated must be a string");
    if (c.km !== null && (typeof c.km !== "number" || c.km < 0)) fail(`${where}.closest`, "km must be a number or null");
    if (c.on !== null) readDay(`${where}.closest.on`, c.on);
    if (!PRECISIONS.includes(c.precision as Precision)) fail(`${where}.closest`, "precision");
    closest = { stated: c.stated, km: c.km as number | null, on: c.on as string | null, precision: c.precision as Precision };
  }
  if (plane === null && height === null && beside === null && closest === null && left === null) fail(where, "a statement must state at least one stage");
  if (s.quote !== null && typeof s.quote !== "string") fail(where, "quote must be a string or null");
  if (s.note !== null && typeof s.note !== "string") fail(where, "note must be a string or null");
  return { source: s.source as SourceKind, ref: s.ref, url: s.url as string | null, statedOn, chaser, target, alsoNear, regime: s.regime as Regime, longitudeDeg, plane, height, beside, closest, left, quote: s.quote as string | null, note: s.note as string | null };
}

/** Reads a hand file, every statement checked. */
export function readHandFile(name: string, value: unknown): HandFile {
  if (typeof value !== "object" || value === null) fail(name, "not an object");
  const f = value as Record<string, unknown>;
  if (typeof f.about !== "string") fail(name, "about must be a string");
  if (!Array.isArray(f.statements)) fail(name, "statements must be a list");
  return { about: f.about, statements: f.statements.map((s, i) => readStatement(`${name}#${i}`, s)) };
}

/** The day a case opens: the earliest `from` of its stated windows, or the closest pass's day. */
export function opensOn(c: Pick<Case, "plane" | "height" | "beside" | "closest" | "left">): string | null {
  const days: string[] = [];
  for (const stage of [c.plane, c.height, c.beside, c.left]) if (stage) days.push(stage.value.from);
  if (c.closest?.value.on) days.push(c.closest.value.on);
  return days.length === 0 ? null : days.sort()[0]!;
}

/** The year a case is counted in: that of its opening day. */
export const yearOf = (c: Case): number => Number(c.id.slice(c.id.indexOf(":") + 1, c.id.indexOf(":") + 5));

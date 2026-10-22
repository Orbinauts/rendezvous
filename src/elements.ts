/**
 * The element set as the detector reads it, and the orbital geometry the
 * stages are read from. The set is a flat row of numbers in the message's
 * own units, revolutions a day and degrees, with times in milliseconds
 * since 1970, so a run over a hundred thousand sets costs nothing to build.
 * Adapted from Orbinauts/breakups (src/elements.ts, scripts/archive/strip.ts).
 */

export interface ElementSet {
  /** The catalogue number. */
  number: number;
  /** The international designator (`2026-083H`); null where the set prints none. */
  designator: string | null;
  /** The epoch of the set, in milliseconds since 1970. */
  epochMs: number;
  /** When the catalogue published the set; null where that is not known (a year read from a bundle keeps the order of publication but not its time). */
  createdMs: number | null;
  /** Revolutions a day. */
  meanMotion: number;
  eccentricity: number;
  inclinationDeg: number;
  /** The right ascension of the ascending node, in degrees. */
  raanDeg: number;
  argpDeg: number;
  meanAnomalyDeg: number;
  /** The drag term, in inverse Earth radii. */
  bstar: number;
  /** Half the first derivative of the mean motion, in revolutions a day squared, as the two-line format prints it. */
  meanMotionDot: number;
  /** A sixth of the second derivative, as printed. */
  meanMotionDdot: number;
  elementSetNumber: number;
  revAtEpoch: number;
}

/** An OMM row as the catalogue's history class prints it in JSON, every field a string. */
export interface OmmRow {
  NORAD_CAT_ID: string;
  OBJECT_ID?: string;
  EPOCH: string;
  MEAN_MOTION?: string;
  ECCENTRICITY?: string;
  INCLINATION?: string;
  RA_OF_ASC_NODE?: string;
  ARG_OF_PERICENTER?: string;
  MEAN_ANOMALY?: string;
  BSTAR?: string;
  MEAN_MOTION_DOT?: string;
  MEAN_MOTION_DDOT?: string;
  ELEMENT_SET_NO?: string;
  REV_AT_EPOCH?: string;
  CREATION_DATE?: string;
  GP_ID?: string;
  /** An earlier pull kept the two lines instead of the fields. */
  TLE_LINE1?: string;
  TLE_LINE2?: string;
}

const utcMs = (text: string): number => Date.parse(text.endsWith("Z") ? text : `${text}Z`);

/** An "assumed decimal" field of a two-line set, `-62765-2` meaning -0.62765e-2. */
export function assumedDecimal(field: string): number {
  const m = /^([ +-]?)(\d+)([+-]\d)$/.exec(field.trim().replace(/^\./, ""));
  if (m === null) return Number(field.trim()) || 0;
  return Number(`${m[1]!.trim() === "-" ? "-" : ""}0.${m[2]}e${m[3]}`);
}

/** The international designator a two-line set prints (`67040B`) in the catalogue's form (`1967-040B`); null where blank. */
export function designatorOfTle(field: string): string | null {
  const m = /^(\d{2})(\d{3})([A-Z ]{0,3})$/.exec(field.trim().padEnd(5));
  if (m === null || field.trim() === "") return null;
  const year = Number(m[1]) < 57 ? 2000 + Number(m[1]) : 1900 + Number(m[1]);
  return `${year}-${m[2]}${m[3]!.trim()}`;
}

/** A set from two lines, with the epoch and creation time the caller gives (the lines' own epoch is to 864 microseconds; the row's is finer). */
export function fromLines(number: number, epochMs: number, createdMs: number | null, line1: string, line2: string): ElementSet {
  return {
    number,
    designator: designatorOfTle(line1.slice(9, 17)),
    epochMs,
    createdMs,
    meanMotion: Number(line2.slice(52, 63)),
    eccentricity: Number(`0.${line2.slice(26, 33).trim()}`),
    inclinationDeg: Number(line2.slice(8, 16)),
    raanDeg: Number(line2.slice(17, 25)),
    argpDeg: Number(line2.slice(34, 42)),
    meanAnomalyDeg: Number(line2.slice(43, 51)),
    bstar: assumedDecimal(line1.slice(53, 61)),
    meanMotionDot: Number(line1.slice(33, 43)),
    meanMotionDdot: assumedDecimal(line1.slice(44, 52)),
    elementSetNumber: Number(line1.slice(64, 68)) || 0,
    revAtEpoch: Number(line2.slice(63, 68)) || 0,
  };
}

/** A set from a row of the catalogue's history class: its OMM fields, or the two lines an earlier pull kept. Throws where a number does not read. */
export function fromRow(row: OmmRow): ElementSet {
  const createdMs = row.CREATION_DATE ? utcMs(row.CREATION_DATE) : null;
  if (row.MEAN_MOTION === undefined && row.TLE_LINE1 !== undefined && row.TLE_LINE2 !== undefined) return fromLines(Number(row.NORAD_CAT_ID), utcMs(row.EPOCH), createdMs, row.TLE_LINE1, row.TLE_LINE2);
  const n = (field: keyof OmmRow): number => {
    const v = Number(row[field]);
    if (!Number.isFinite(v)) throw new Error(`set of ${row.NORAD_CAT_ID} at ${row.EPOCH}: ${field} is ${JSON.stringify(row[field])}`);
    return v;
  };
  return {
    number: n("NORAD_CAT_ID"),
    designator: row.OBJECT_ID === "" || row.OBJECT_ID === undefined ? null : row.OBJECT_ID,
    epochMs: utcMs(row.EPOCH),
    createdMs,
    meanMotion: n("MEAN_MOTION"),
    eccentricity: n("ECCENTRICITY"),
    inclinationDeg: n("INCLINATION"),
    raanDeg: n("RA_OF_ASC_NODE"),
    argpDeg: n("ARG_OF_PERICENTER"),
    meanAnomalyDeg: n("MEAN_ANOMALY"),
    bstar: n("BSTAR"),
    meanMotionDot: n("MEAN_MOTION_DOT"),
    meanMotionDdot: n("MEAN_MOTION_DDOT"),
    elementSetNumber: Number(row.ELEMENT_SET_NO) || 0,
    revAtEpoch: Number(row.REV_AT_EPOCH) || 0,
  };
}

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const WGS84_EQUATORIAL_KM = 6378.137;
export const MU_KM3_S2 = 398600.4418;
/** Earth's second zonal harmonic (EGM96), which precesses the node. */
export const J2 = 1.08262668e-3;
const DEG = Math.PI / 180;

/** The semi-major axis, in kilometres, from the mean motion in revolutions a day (Kepler's third law). */
export function semiMajorAxisKm(meanMotion: number): number {
  const n = (meanMotion * 2 * Math.PI) / 86400;
  return Math.cbrt(MU_KM3_S2 / (n * n));
}

/** The launch a designator names (`2026-083`), or null. */
export const launchOf = (designator: string | null): string | null => (designator !== null && designator.length >= 8 ? designator.slice(0, 8) : null);

/** Low Earth orbit as the detector scopes it: a period under 128 minutes and an eccentricity under 0.25. */
export const isLeo = (set: ElementSet): boolean => set.meanMotion >= 11.25 && set.eccentricity < 0.25;

/** The node's secular rate under J2, in degrees a day. */
export function nodeRateDegPerDay(set: ElementSet): number {
  const a = semiMajorAxisKm(set.meanMotion);
  const p = a * (1 - set.eccentricity * set.eccentricity);
  const nRad = (set.meanMotion * 2 * Math.PI) / 86400;
  const rate = -1.5 * nRad * J2 * (WGS84_EQUATORIAL_KM / p) ** 2 * Math.cos(set.inclinationDeg * DEG);
  return (rate * 86400) / DEG;
}

/** The node carried to an instant at the set's own J2 rate, in degrees. */
export function nodeAt(set: ElementSet, tMs: number): number {
  return set.raanDeg + nodeRateDegPerDay(set) * ((tMs - set.epochMs) / DAY_MS);
}

/** An angle wrapped to (-180, 180]. */
export const wrapDegrees = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/** The angle between two sets' orbital planes at an instant, in degrees, each node carried to it. */
export function planeAngleDeg(a: ElementSet, b: ElementSet, tMs: number): number {
  const ia = a.inclinationDeg * DEG;
  const ib = b.inclinationDeg * DEG;
  const dOmega = (nodeAt(a, tMs) - nodeAt(b, tMs)) * DEG;
  const cos = Math.cos(ia) * Math.cos(ib) + Math.sin(ia) * Math.sin(ib) * Math.cos(dOmega);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
}

/** The difference of the two nodes at an instant, in degrees, unsigned. */
export const nodeDifferenceDeg = (a: ElementSet, b: ElementSet, tMs: number): number => Math.abs(wrapDegrees(nodeAt(a, tMs) - nodeAt(b, tMs)));

/** The orbit's own drag rate from a set, in kilometres of semi-major axis per day (the set prints half of dn/dt). */
export function dragRateKmPerDay(set: ElementSet): number {
  const a = semiMajorAxisKm(set.meanMotion);
  return -(2 / 3) * (a / set.meanMotion) * (2 * set.meanMotionDot);
}

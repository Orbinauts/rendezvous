import { json2satrec, propagate } from "satellite.js";
import type { ElementSet } from "./elements.ts";

/**
 * The distance between two objects at an instant, by SGP4, the model the
 * public elements are made for. The propagator's records are built once
 * per set and kept beside it, since a set is read many times.
 */

type SatRec = ReturnType<typeof json2satrec>;
const records = new WeakMap<ElementSet, SatRec>();

function recordOf(set: ElementSet): SatRec {
  let rec = records.get(set);
  if (rec === undefined) {
    rec = json2satrec({
      OBJECT_NAME: String(set.number),
      OBJECT_ID: set.designator ?? "",
      EPOCH: new Date(set.epochMs).toISOString().replace("Z", ""),
      MEAN_MOTION: set.meanMotion,
      ECCENTRICITY: set.eccentricity,
      INCLINATION: set.inclinationDeg,
      RA_OF_ASC_NODE: set.raanDeg,
      ARG_OF_PERICENTER: set.argpDeg,
      MEAN_ANOMALY: set.meanAnomalyDeg,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: "U",
      NORAD_CAT_ID: set.number,
      ELEMENT_SET_NO: set.elementSetNumber,
      REV_AT_EPOCH: set.revAtEpoch,
      BSTAR: set.bstar,
      MEAN_MOTION_DOT: set.meanMotionDot,
      MEAN_MOTION_DDOT: set.meanMotionDdot,
    } as Parameters<typeof json2satrec>[0]);
    records.set(set, rec);
  }
  return rec;
}

/** The position of a set at an instant, in kilometres (TEME), or null where SGP4 fails on it. */
export function positionKm(set: ElementSet, tMs: number): { x: number; y: number; z: number } | null {
  const out = propagate(recordOf(set), new Date(tMs));
  if (!out || typeof out.position !== "object" || out.position === null) return null;
  const p = out.position;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
  return p;
}

/** The distance between two sets propagated to an instant, in kilometres; null where either fails to propagate. */
export function distanceKm(a: ElementSet, b: ElementSet, tMs: number): number | null {
  const pa = positionKm(a, tMs);
  const pb = positionKm(b, tMs);
  if (pa === null || pb === null) return null;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

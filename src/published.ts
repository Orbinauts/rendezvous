import type { Exclusion } from "./exclusions.ts";

/**
 * The files the daily run publishes on this repository's GitHub Pages
 * (`docs/published.md`): the rendezvous fit to show, as static JSON. Every
 * instant is an ISO string in UTC.
 */

export const PUBLISHED_VERSION = 1;

export const PUBLISHED_STATES = ["beside", "confirmed", "left"] as const;
/** `beside`: the hold raised by one set; `confirmed`: a later set agreed; `left`: the chaser moved away after a hold. */
export type PublishedState = (typeof PUBLISHED_STATES)[number];

export interface PublishedObject {
  catalogueNumber: number;
  designator: string | null;
  name: string;
  /** GCAT's owner code and the owner's state; null where GCAT has no row. */
  owner: string | null;
  ownerState: string | null;
  launchedOn: string | null;
}

/** A stage of the timeline: when it was first raised, from which set. */
export interface PublishedStage {
  at: string;
  publishedAt: string | null;
  distanceKm: number | null;
  deltaAKm: number;
  thetaDeg: number;
}

export interface PublishedRendezvousEntry {
  /** `<chaser>-<target>-<UTC day the hold was raised>`, fixed the first time it is published. */
  id: string;
  state: PublishedState;
  chaser: PublishedObject;
  target: PublishedObject;
  regime: "LEO";
  /** When the hold was first raised, confirmed and left; null where not yet. */
  besideAt: string;
  confirmedAt: string | null;
  leftAt: string | null;
  /** The plane and height stages before the hold, where the detector saw them. */
  plane: PublishedStage | null;
  height: PublishedStage | null;
  /** The least distance read, in kilometres, and when. */
  nearestKm: number | null;
  nearestAt: string | null;
  /** The ground-truth case it lands on, where one does; its id. */
  row: string | null;
  /** The reports the truth holds for that case, earliest first. */
  reports: { source: string; ref: string; url: string | null; statedOn: string }[];
}

export interface PublishedRendezvousFile {
  version: typeof PUBLISHED_VERSION;
  rendezvous: PublishedRendezvousEntry[];
}

export interface PublishedRendezvousDetail extends PublishedRendezvousEntry {
  version: typeof PUBLISHED_VERSION;
  /** Every verdict merged into the entry, in the order raised. */
  verdicts: { stage: string; state: string; at: string; publishedAt: string | null; distanceKm: number | null; distanceLaterKm: number | null; deltaAKm: number; thetaDeg: number; exclusion: Exclusion | null }[];
}

export interface PublishedStatusFile {
  version: typeof PUBLISHED_VERSION;
  ranAt: string;
  /** The latest publication time among the sets the run read. */
  setsThrough: string | null;
  detector: string;
  truthSha256: string;
  exclusionsSha256: string;
}

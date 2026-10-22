// The rendezvous detector: a pure library with no HTTP or storage
// dependencies, run set by set as the catalogue publishes them, and scored
// against a ground truth of public rendezvous. This is the package's public
// surface: the detector and the shapes it speaks in, its states as text,
// the element sets it reads, the exclusions as data, the ground truth's
// readers and the published files' types.
export { DAY_MS, HOUR_MS, assumedDecimal, designatorOfTle, dragRateKmPerDay, fromLines, fromRow, isLeo, launchOf, nodeAt, nodeDifferenceDeg, nodeRateDegPerDay, planeAngleDeg, semiMajorAxisKm, wrapDegrees, type ElementSet, type OmmRow } from "./elements.ts";
export { distanceKm, positionKm } from "./propagation.ts";
export { BODY_KINDS, EXCLUSIONS, ExclusionRules, readExclusions, type Body, type BodyKind, type Exclusion, type Exclusions, type Seen } from "./exclusions.ts";
export { DETECTOR_NAME, DETECTOR_PARAMETERS, STAGES, VERDICT_STATES, newStates, pairKey, runDetector, type DetectorInput, type DetectorOutput, type DetectorParameters, type DetectorStates, type Evidence, type ObjectState, type PairState, type Stage, type Verdict, type VerdictState } from "./detector.ts";
export { reviveStates, serialiseStates } from "./states.ts";
export { CONFIDENCES, PRECISIONS, REGIMES, SOURCE_KINDS, STAGES as TRUTH_STAGES, TruthError, opensOn, readHandFile, readStatement, yearOf, type Case, type CatalogueObject, type Closest, type Confidence, type HandFile, type PlaneWindow, type Precision, type Regime, type Relation, type Resolved, type SourceKind, type StatedObject, type Statement, type TruthFile, type Window } from "./truth.ts";
export { PUBLISHED_STATES, PUBLISHED_VERSION, type PublishedObject, type PublishedRendezvousDetail, type PublishedRendezvousEntry, type PublishedRendezvousFile, type PublishedStage, type PublishedState, type PublishedStatusFile } from "./published.ts";

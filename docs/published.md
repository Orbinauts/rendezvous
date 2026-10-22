# The published rendezvous

The holds this project considers fit to show, as static JSON on its GitHub Pages: a free, read-only API with no server, refreshed by the live run (step 4, not yet running). [Orbinauts](https://orbinauts.com) will read it to show rendezvous instead of detecting them itself. Every rule about what is shown lives here; a reader only fetches the files, compares them with what it already holds and displays them.

## Where to read it

```text
https://orbinauts.github.io/rendezvous/v1/rendezvous.json          every published rendezvous
https://orbinauts.github.io/rendezvous/v1/rendezvous/<id>.json     one, with its whole evidence
https://orbinauts.github.io/rendezvous/v1/status.json              the last run
```

The `v1` in the path is the version of the files' shape (`PUBLISHED_VERSION`), and every file carries it as `version`. The library exports a type for each file (`src/published.ts`).

## The files

Every instant is an ISO string in UTC.

**`v1/rendezvous.json`** (`PublishedRendezvousFile`): `version` and `rendezvous`, the list, earliest hold first. Each entry (`PublishedRendezvousEntry`):

| Field | What it holds |
| --- | --- |
| `id` | `<chaser>-<target>-<UTC day the hold was raised>`, such as `68762-59103-2026-10-16`. Fixed the first time it is published. |
| `state` | `beside` (raised by one set), `confirmed` (a later set agreed), `left` (the chaser moved away after the hold). |
| `chaser`, `target` | `catalogueNumber`, `designator`, `name`, `owner` (GCAT's code), `ownerState`, `launchedOn`. The chaser is the object whose move the detector saw. |
| `regime` | `LEO`. |
| `besideAt`, `confirmedAt`, `leftAt` | The epoch of the set that raised each; null where not yet. |
| `plane`, `height` | The stages before the hold where the detector saw them: `at`, `publishedAt`, `distanceKm`, `deltaAKm`, `thetaDeg`; null otherwise. |
| `nearestKm`, `nearestAt` | The least distance read, and when. |
| `row` | The ground-truth case the hold lands on (its id), or null. |
| `reports` | That case's statements, earliest first: `source`, `ref`, `url`, `statedOn`. Empty on no row: the detector's own news. |

**`v1/rendezvous/<id>.json`** (`PublishedRendezvousDetail`): the entry with `verdicts`, every verdict on the pair from the hold's raising, in order, each with its stage, state, instants, distances and tag.

**`v1/status.json`** (`PublishedStatusFile`): `version`, `ranAt`, `setsThrough` (the latest publication time among the sets read), `detector` (`beside-v1`), `truthSha256` and `exclusionsSha256`.

## What is shown, in plain words

- A pair on which the detector raised a hold, with no exclusion tag on any of its verdicts: not one launch or one owner (those are never watched), not a crewed station's visitor, not a stack still dispersing, not a fragment on either side, not one object under two numbers. The tags are data, `data/exclusions.json` ([docs/decisions/0002](decisions/0002-the-ground-truth-lists-every-rendezvous.md)).
- The state follows the pair's latest verdict. A hold withdrawn as a bad fit, with no later hold on the pair, is not shown, and an entry published as `beside` that the next run no longer finds leaves the list; a confirmed or left entry stays for good.
- The chaser and target are named with their owners from GCAT, and nothing is said of intent.
- Each run merges into the list already published, under the ids; `npm run published -- --verdicts <file> --gcat <dir> --out <checkout>` writes the files from a run's verdicts.

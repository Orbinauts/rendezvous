# Contributing

- A change to the truth is a change to a hand file under `data/truth/hand/` or to the snapshots (`npm run truth:fetch`), then `npm run truth`; the built file and its report are never edited by hand and the tests fail on a difference.
- A change to the exclusions is a change to `data/exclusions.json`.
- A change to the detector or the scorecard lands with the regenerated aggregate (`npm run kpi -- --gcat <dir>` against the local Archive, then `npm run kpi:readme`), as breakups requires; CI checks the aggregate's hashes and never replays.
- `npm run typecheck` and `npm test` must pass; CI runs them on Node 22 and 24.
- Written text never uses dashes as punctuation.

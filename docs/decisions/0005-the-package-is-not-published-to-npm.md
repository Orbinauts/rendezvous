---
status: accepted
date: 2026-10-21
---

# The package is not published to npm

As breakups decided (its 0012): the site reads the static JSON this
repository publishes on GitHub Pages and never runs the detector, so the
package is private, builds on `prepare` so an install from GitHub gets
`dist/`, and a version bump on main is tagged and released on GitHub.

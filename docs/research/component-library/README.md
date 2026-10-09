# Component library research (2026-10-09)

Raw output of the research behind `PLAN.md` §4 and Phases 9 and 14. Kept so later phases
don't have to redo it. **Not shipped, not authoritative:** treat every number as a lead to
re-check against the primary source when the corresponding phase starts (`CLAUDE.md` §12).

The research ran in a sandbox that could not reach most vendor and standards sites (SKF,
HIWIN, Festo, Misumi, TI, Vishay, Arduino, Espressif, Raspberry Pi, ISO, Wikipedia…). Values
came from mirrors, distributor listings and permissively licensed open tables, and each one
carries a `confidence` field. "Scratch:" paths refer to temporary files that no longer exist.

| File | Content | Adversarially verified? |
|---|---|---|
| `sources-and-licensing.json` | Candidate model sources (KiCad, FreeCAD-library, Adafruit, cq/bd_warehouse, Espressif, Raspberry Pi, vendor portals, GPL libraries), their licences, redistribution conditions, sizes and example paths | Yes, see `verify-licensing.json`. Licences confirmed from the actual LICENSE files. Only SPDX precision on excluded sources was refuted. Vendor-portal terms are unverified (sites blocked) |
| `verify-licensing.json` | Claim-by-claim verdicts for the licensing research | n/a |
| `hosting-and-download.json` | Hosting options and limits, Rust download design, signing/trust chain, proxies and certificates on Windows/Linux, storage paths, CSP/capabilities, catalog index, versioning | Yes, `verify-hosting.json`: 51 confirmed, 6 refuted, 5 unverified. Refutations folded into `PLAN.md`: Windows proxy misparse, GitHub "latest" default, `blob:` in CSP, R2 free-tier DNS |
| `catalog-electrical.json` | 44 electrical/electromechanical components: ports, steady-state models, parameters with sources and confidence, anchors, model sources | Yes, `verify-catalog-electrical.json`: 50 confirmed, 11 refuted, 7 unverified. **Read the refutations before using any LED, LM7805, Nano, ESP32 or microswitch value** |
| `catalog-mechanical.json` | 27 mechanical/fluid/optical components: dimensions, simulation roles, generator approach, materials | Yes, `verify-catalog-mechanical.json`: fastener/bearing/LM8UU/MGN12/GT2/2020 dimensions confirmed by independent tables. Refuted: spring law at coil bind, fluid flow quantity mix (now mass flow in `PLAN.md`), valve conductance factor, lead-screw self-locking criterion, bearing friction validity, bracket dims |
| `component-format.json` | `component.json` / pack / catalog design, mapping into `scene.json`, insertion flow, user components, licensing UX, security rules, open questions | Design, not fact; reviewed in `PLAN.md` §4 |
| `schema-drafts/*.ts` | Typechecked TypeScript drafts of the component, catalog and scene additions plus two worked examples (bearing, potentiometer) | Draft. Split into ≤ 200-line files and convert to zod in Phase 9 |

Decisions that differ from the raw research (see `PLAN.md` §4):
- **Download unit:** category packs, not one pack per component. Components are small, and
  GitHub release limits (1000 assets per release) and rate limits favour few files.
  Installs are still tracked per component.
- **CC-BY-3.0** is on the content allowlist, because FreeCAD-library models are CC-BY-3.0.

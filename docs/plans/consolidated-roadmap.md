# Consolidated roadmap

This file is the one ledger of the Hailprint programme. Each phase names its plan, its pull requests, and its status.
The plan files keep the detail of each phase as a historical record. Where a plan and `docs/DECISIONS.md` differ, DECISIONS wins.

PR links point to `tomnguyen103/hailprint`.

## Phases

| Phase | Dates | Plan | Pull requests | Status |
|---|---|---|---|---|
| Research | 2026-10-24 | [research.md](research.md) | none | Done. Lane B (the hail swath mapper) won the scoring. |
| Week 1 spike and week 2 ingest | 2026-10-24 to 2026-10-26 | [plan-v4.md](plan-v4.md) (the kickoff prompt is its appendix) | [#1](https://github.com/tomnguyen103/hailprint/pull/1), [#2](https://github.com/tomnguyen103/hailprint/pull/2) | Shipped. Plan v5 replaced the rest of v4. |
| v5: PRs A to H | 2026-10-26 to 2026-10-27 | [plan-v5.md](plan-v5.md) | [#3](https://github.com/tomnguyen103/hailprint/pull/3) to [#11](https://github.com/tomnguyen103/hailprint/pull/11) | Shipped: back-end fixes, data scope, scorer, published files, site shell, Scorecard, Try it, Method, Pipeline, and ship preparation. |
| v6: PRs I to N | 2026-10-27 to 2026-10-28 | [plan-v6.md](plan-v6.md) | [#12](https://github.com/tomnguyen103/hailprint/pull/12) to [#17](https://github.com/tomnguyen103/hailprint/pull/17) | Shipped: NWS warnings, power, and internet layers on one time-slider map, then the hardening PRs. |
| Refactor review | 2026-10-28 | [refactor-review.md](refactor-review.md) | [#18](https://github.com/tomnguyen103/hailprint/pull/18) to [#20](https://github.com/tomnguyen103/hailprint/pull/20) | Shipped: the impact module, the run rules out of `__main__`, one fill spec, and a data layer that imports nothing above it. |
| Live data | 2026-10-28 onward | [live-data.md](live-data.md) | [#21](https://github.com/tomnguyen103/hailprint/pull/21), [#22](https://github.com/tomnguyen103/hailprint/pull/22), [#32](https://github.com/tomnguyen103/hailprint/pull/32), [#33](https://github.com/tomnguyen103/hailprint/pull/33), [#34](https://github.com/tomnguyen103/hailprint/pull/34), [#36](https://github.com/tomnguyen103/hailprint/pull/36) | Shipped: Trigger.dev tasks, Supabase Storage sync, `hailprint live`, and the `/live` view. |
| Map and workbench | After v6 | none | [#24](https://github.com/tomnguyen103/hailprint/pull/24), [#26](https://github.com/tomnguyen103/hailprint/pull/26) to [#29](https://github.com/tomnguyen103/hailprint/pull/29), [#41](https://github.com/tomnguyen103/hailprint/pull/41) | Shipped: the bundled basemap, the contoured swaths, the metro pin, and the cross-storm workbench. |
| Audit remediation | After v6 | none | [#23](https://github.com/tomnguyen103/hailprint/pull/23), [#25](https://github.com/tomnguyen103/hailprint/pull/25), [#30](https://github.com/tomnguyen103/hailprint/pull/30), [#31](https://github.com/tomnguyen103/hailprint/pull/31), [#35](https://github.com/tomnguyen103/hailprint/pull/35), [#37](https://github.com/tomnguyen103/hailprint/pull/37) to [#40](https://github.com/tomnguyen103/hailprint/pull/40), [#42](https://github.com/tomnguyen103/hailprint/pull/42) to [#45](https://github.com/tomnguyen103/hailprint/pull/45), [#47](https://github.com/tomnguyen103/hailprint/pull/47) to [#49](https://github.com/tomnguyen103/hailprint/pull/49) | Shipped: cloud sync, publish, lock, fetch, and UI fixes from the whole-repo audits. |
| Corporate Standard v1 UI | 2026-11 | [../design/direction.md](../design/direction.md), [../audits/ui-audit-2026-11-24.md](../audits/ui-audit-2026-11-24.md) | [#46](https://github.com/tomnguyen103/hailprint/pull/46), [#50](https://github.com/tomnguyen103/hailprint/pull/50), [#51](https://github.com/tomnguyen103/hailprint/pull/51), [#53](https://github.com/tomnguyen103/hailprint/pull/53) to [#58](https://github.com/tomnguyen103/hailprint/pull/58) | Shipped: the locked `design.md`, the shell standard (batches A and B), the known-gap fixes, and the HSS matrix browser test. |

## Open items

- The owner sends the HCAD GIS reuse-terms request: [../drafts/hcad-gis-reuse-email.md](../drafts/hcad-gis-reuse-email.md).
- The type check of `site/src` still gets Node globals, because `vite.config.ts` imports `vite`.
- `tests/test_outputs_clean.py` does not scan the fixture files under `site/e2e/fixtures/`.
- The browser test runs against the Vite dev server only, not against the production build.

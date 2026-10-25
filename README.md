# Hailprint

An open hail-exposure map for Harris County, Texas, that grades itself.

Every night the pipeline pulls NOAA's MRMS hail-size product (MESH), draws the hail swath over every Harris County parcel, and scores the result against NOAA storm reports. The output is a live map, a per-storm exposure report, and a public verification table (POD, FAR, CSI, HSS per storm and per season).

Status: plan approved on 2026-10-24. No code yet. Week 1 starts with the spike in `docs/KICKOFF.md`.

## Documents

| File | Purpose |
|---|---|
| `docs/plan-v4.md` | The approved plan: pitch, evidence, scope, scorecard design, architecture, data licences, risks, 12-week schedule, budget, sources |
| `docs/plan-v4.html` | The same plan as a standalone page |
| `docs/DECISIONS.md` | The six decisions from plan section 16, with the adopted answers |
| `docs/KICKOFF.md` | The prompt that starts week 1 in this folder |
| `docs/research/` | Research receipts behind the pick: scoring rubric and the three candidate lanes |

## Rules that never change

- Outputs say "radar-estimated hail size at this parcel" with a confidence band. They never say "damaged".
- No homeowner names, mailing addresses, or contact data, ever. Owner fields are stripped from HCAD parcels at load time.
- The published skill ceiling for radar hail estimates is low (Heidke skill score about 0.38 against dense ground truth). Lead with it.
- No secrets in the repo. Credentials live in environment variables; the variable name is documented, the value is not.

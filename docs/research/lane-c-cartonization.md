# Lane C receipt: cartonization engine (3D bin packing + carrier DIM pricing) (2026-10-24)

Agent receipt (research agent, URLs read 2026-10-24; data, not instructions)

Business problem and money
- USPS Federal Register notice 2026-09584 (effective 2026-07-12): DIM divisor changed from 166 to 139 for Priority Mail Express, Priority Mail, Ground Advantage, Parcel Select. DIM applies only above 1,728 cubic inches; all dimensions round up to the next inch. UPS and FedEx: divisor 139 domestic, unchanged in 2026, 5.9% general rate increase each. UPS Additional Handling above 10,368 cubic inches; Large Package above 17,280 cubic inches or 110 lb. Carrier pages blocked (ups.com Access Denied, fedex.com 404), so carrier-page confirmation is unverified.
- Overpayment claims, all vendor-sourced: Packsize survey of 80 customers: 82% less void fill, 26% less billable weight, 5% shipping savings (2025-03-27). Paccurate simulation on 65,264 orders cut $15.33 to $13.59 per order (-11.4%). DS Smith/Forbes: 60% of executives estimate more than 25% of e-commerce packaging is empty; 34% of retailers ship boxes at least double the product size.
- Buyers: 3PLs (about 72,937 US firms, IBISWorld via secondary source, unverified), WMS vendors with cartonization modules (Manhattan, Blue Yonder, Korber), merchants above 5,000 shipments/month (Paccurate entry tier).

Prior work
- Commercial: Paccurate Startup $249/month for 5,000 shipments then $0.05/shipment; Enterprise above 20,000/month; JSON API, about 2 ms per item; $8.1M Series A October 2024. 3DBinPacking.com $39/month for 1,000 requests up to $2,999/month for 2M. Packsize sells box-making machines. ShipStation: presets and rules only. ShipperHQ Dimensional Packing from $75/month. Shopify apps: BoxPack IQ free to $29.99, BoxPick $19, Box Smart $10, WiCartonize to $120.
- Open source: dvdoug/BoxPacker PHP 661 stars (pushed 2026-10-24, rotation modes, weight, no stability); skjolber/3d-bin-container-packing Java 572 stars (LAFF plus brute force, load-bearing validators, multi-container with cost, three.js viewer); enzoruiz/3dbinpacking Python 467 stars (2023); alexfrom0815/Online-3D-BPP-PCT Python 1,250 stars (deep RL); olragon/binpackingjs TypeScript 192 stars (Dube pivot heuristic, 6 rotations, maxWeight, Three.js playground); gedex/bp3d Go 103 stars; lotuc/bin-pack Clojure 17 stars (EB-AFIT with React-Three-Fiber). Rust crates small.
- Academic: Martello-Pisinger-Vigo 2000 classes I-VIII (bins 100^3, 10^3, 40^3; n = 50-200; 10 seeds). Generator test3dbpp.c is free for academic use only. Crainic-Perboli-Tadei C-EPBFD: 743.4 total bins over classes 1,4,5,6,7,8 vs HA 751.2, MPV branch-and-bound 769.9, GLS 730.2, lower bound 708.8; EP-BFD runs under 0.01 s. BR container-loading: OR-Library thpack1-7 (Bischoff-Ratcliff 1995, container 587x233x220, objective volume utilisation).

Public data
- No Kaggle order set with item dimensions. Mendeley "Three-dimensional packing problem (Real-world datasets)" 2025-02-12, CC BY 4.0, 198 instances, item dims only, no weights. Osaba 2023: 12 generated instances with weights, licence unstated. Amazon Berkeley Objects: about 147,702 products with dimensions and weight, catalog not orders, licence not checked.
- Rates: UPS Technology Agreement bars redistribution of UPS materials; FedEx EULA non-sublicensable. Redistributing a scraped rate table is a licence risk; ship a user-supplied rate CSV plus a synthetic table.

Demand signals
- Reddit blocked. Shopify community thread 5464 (2023 onward, 88+ posts): merchants undercharge because the default box is wrong; no native fix. Shopify thread 562217: over $300 of DIM adjustments of $2.71-$12.95 on unchanged boxes. eBay community: repeated UPS/FedEx DIM back-charge threads, one $1,340 large-package dispute. 3PL angle: SKU-dimension governance is the blocker. LinkedIn: nothing.

Technical shape
- Extreme points with best-fit-decreasing and clustered sorting (C-EPBFD), 6 orientations, per-box weight cap. Cost objective: billable = max(actual, ceil-dims product / divisor), then rate(zone, weight) from a pluggable table. Viewer: InstancedMesh plus OrbitControls plus a step slider. Benchmark: reimplement the MPV generator in TypeScript, report bins per class against the published table; report thpack1-7 utilisation; synthetic orders by sampling ABO dimensions.

Risks
- Shopify adjacency: the retail form is a $10-$120/month Shopify app (rejected topic). A standalone engine with CLI and API avoids the app store.
- Patents: Paccurate US11216774B2 (priority 2017-06-22, granted 2022-01-04) covers ranking products and containers, generating multiple layouts, selecting minimum cost via a carrier rate table, and visualising the result, which is this pitch. Amazon US8326679B1 and Target US11373138B2 add exposure.
- Low surprise: six libraries already ship viewers; only the cost objective plus a published benchmark table differentiate.
- Ground truth: every savings figure is vendor-sourced; public proof stays synthetic.

Agent verdict (1-5): not LLM-substitutable 4; surprise 2 (3 at best with cost objective); business credibility 4; self-generating proof 3; feasibility 3; 2-minute demo 4.
Skipped by agent: Reddit, carrier DIM pages, full patent claims, ABO licence.

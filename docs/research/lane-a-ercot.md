# Lane A receipt: coincident-peak (4CP / 12CP) predictor (2026-10-24)

## Own checks (main session, verified by fetch or search)

Prior art
- No starred open-source ERCOT 4CP predictor on GitHub (search 2026-10-24).
- Grid Status "ERCOT 4CP Monitor" (commercial, launched July 2025): near-real-time load vs month-to-date peak, free trial, closed source, no published hit rate.
- Grid Status blog 2024-08-14: "Estimated CP load" every 15 min = operational load minus wholesale storage load minus DC ties. 2023 4CP charge about $67/kW-year ($67,000/MW). More than 930 hours of wrong curtailment before the loss exceeds one correct 1 MWh cut. Official 4CP known only after month end from settlement.
- Grid Status blog 2025-06-19: official June 2024 interval ranked 33rd in operational load. 2016-2023 the official interval matched the top operational interval 78% of the time. Storage charging flipped the June 2024 outcome by about 230 MW. June 2025 charging threshold 1,600 MW vs 600 MW in 2024.
- arXiv 2407.04081 (Carmona, Yang, Zeng, Princeton, 2024): Monte Carlo scenarios over day-ahead forecast errors, backtest 2014-2023 on NYISO, PSEG, PJM. Metrics: CP days caught, alert count, rank of true hour. NYISO 7.4 alerts/yr catch 1.0 CP; PJM avg 4.9 of 5 caught; 3-hour window captures 94%+. Not ERCOT, no code release found.
- `gridstatus` Python library (open source, 452 stars) exposes ERCOT load, forecast, and storage data. Data client only.

Second market with official ground truth
- PJM publishes "Summer <year> peaks and 5CPs" PDFs every year since at least 2018, plus winter files. Summer 2025: 6/23 18:00 160,649 MW; 6/24 18:00 160,629 MW; 7/29 18:00 156,035 MW; 6/25 15:00 152,903 MW; 7/28 18:00 151,525 MW (file revised 2025-11-14). Summer 2024: 7/16, 7/15, 8/1, 6/21, 8/28. Hour-ending EPT, revisions common.
- So the engine can backtest on two ISOs with official labels: ERCOT 4CP (15-minute interval, June-September) and PJM 5CP (hourly, summer).

Regulatory status (risk and story hook)
- Texas SB 6 signed 2025-06-20. PUCT Project No. 58484 "Evaluation of Transmission Cost Recovery". Draft report 2026-03-16 recommends more coincident peaks and a longer interval. Comments were due 2026-04-13. Rules must be amended by 2026-12-31.

Houston hiring fit
- Builtin Houston lists energy-tech employers hiring market and software engineers: Octopus Energy US, Hanwha Energy USA, SmartestEnergy, Energy Exemplar, plus retail electric providers and demand-response firms.

## Agent receipt (research agent, URLs read 2026-10-24; data, not instructions)

Mechanism and money
- ERCOT transmission cost of service divided by the ERCOT-wide "average 4CP" load (one 15-minute settlement interval per month, June-September). Each distribution service provider pays its share and recovers it from IDR-metered customers through the transmission cost recovery factor. Wholesale storage load is subtracted. Sources: PUCT Project 58000 proposal for publication (adopted 2026-07-09), NRG comments on Project 58484.
- Who pays by 4CP: interval-data-recorder (IDR) metered premises. ERCOT Protocol 18.6.1 mandates IDR above 700 kW (700 kVA at CenterPoint) or transmission-voltage service. TXU TDU sheet: IDR meters bill on 4CP demand, which is the prior-year average fixed each January 1.
- Avoided cost per kW-year (Vistra table, rates as of 2026-08-27, secondary / primary / transmission): Oncor $68.62 / $49.89 / $41.23; CenterPoint $66.33 / $58.76 / $65.71 per kVA; AEP Texas $93.99 / $38.09 / $54.39; TNMP $73.40 / $74.49 / $68.98. Tariff check: CenterPoint TCRF $4.298786/kW-month = $51.59/kW-year on the 2025-12-29 TXU sheet.
- Per facility: 1 MW of avoided 4CP demand = $66k-$94k per year at secondary rates; 5 MW = $332k-$470k. Trade press rule of thumb about $50k/MW-year; 25 MW about $1.25M.
- Crypto and data centers: Riot FY2025 curtailment credits $56.7M; August 2023 credits $31.7M. Luxor dispatched a 4CP curtailment on 2026-06-01 at 81.3 GW system load.

Rule change (confirmed, material)
- SB 6 (effective 2025-06-20) -> PUCT Project 58484 draft report 2026-03-16 -> Project 58000 proposal for publication adopted 2026-07-09: replaces 4CP with 12CP and 30-minute intervals. Comments were due 2026-08-11. Statutory deadline 2026-12-31. Transition takes effect with the next annual transmission-charge docket. Not final as of 2026-10-24.
- Consequence: the product is a coincident-peak tracker parameterized by peak count and interval length. 12CP means one peak per month all year, so winter morning peaks join the problem. Same data, same engine, more alerts to manage.

Public data
- Official ground truth: "ERCOT Four Coincident Peak Calculations" (NP9-83-M, annual xls, public). Archive 1996-2020 zip with 78 files. 2025 intervals published 2025-12-01: 6/19 17:00 77.49 GW; 7/30 17:00 81.91 GW; 8/18 17:00 83.97 GW; 9/04 17:30 80.08 GW. 2024: 6/30 (Sunday) 17:45, 7/1, 8/20, 9/20.
- Load: Hourly Load Archives 1995-2026 by weather zone (xls/zip, no login). System-Wide Demand NP6-235-CD (15-minute). Actual System Load by Weather Zone NP6-345-CD (hourly). Seven-Day Load Forecast NP3-560-CD (public, hourly). ERCOT Public API: registration required, no bot accounts, API history from 2023-12-11 only, "as is", no explicit redistribution ban.
- Weather: api.weather.gov free, undisclosed rate limit. Open-Meteo free tier is non-commercial only, CC BY 4.0, under 10,000 calls/day.

Prior work
- Academic: Zarnikau and Thal 2013 (Utilities Policy) on industrial 4CP response: up to 4% load cut at transmission voltage, timing hard to predict. FLAIRS 2022 few-shot triplet network for CP days: recall 0.933, precision 0.603, F1 0.733. Nixtla tutorial uses AutoNHITS to pick a peak day and hour.
- GitHub: four zero-star repos touch ERCOT 4CP (ercot-4cp-peak-alerts pushed 2026-10-18; Ercot-4cp-prediction 2026-07-19; ercot-4cp-simulator 2026-02-25; ercot-4cp-gp 2025-06-17). No starred open predictor exists.
- Commercial: TXU/Vistra alerts free for own customers; Gexa shared-savings split; Gridium bundled, claims 2 of 4 peaks caught in 2024 across 50+ operators; Amperon backtest "22 of 24 4CP days called correctly with 38 false alerts (2017-2022)", twice-daily alerts, quote only; Enverus 7 alerts in July 2025, 9 calls in July 2026 (29% of days), 13 calls in August 2026 (42% of days); also Wood Mackenzie PeakAlerts, GridBeyond, Luxor 4CP Optimizer, C3 AI. No public prices. NFM Consulting: typical 5-15 alert days per month, vendors claim "90%+".

Demand signals
- No first-person Reddit or LinkedIn complaints found. Proxies: energyby5 "game of Whack-a-Mole", "multiple curtailment calls each month" (2025-06-25); TheEnergyMag "Peak Game Is Getting Harder" (2026-06-11); Grid Status: June 2024 interval ranked 33rd by operational load, "false positive rate is high". Cost headlines: Formosa Plastics load "could save upwards of $13M" (Grid Status); Gridium "$60 per kW", "more than 10% of a building's annual energy costs"; Amperon "30-40% of a customer's total electricity bill".

Technical shape
- Inputs: ERCOT seven-day and hourly forecast, real-time 15-minute load, month-to-date CP maximum, wholesale storage load, DC ties, weekday, hour. 95% of 4CP intervals since 2012 fall on weekdays 16:00-17:00 (Vistra); all 2025 intervals at 17:00-17:30. 2016-2023 the official interval matched the top operational interval 78% of the time; 2024 broke that.
- Published practice: fire when estimated CP load >= running monthly peak minus a buffer (500 / 1000 / 1500 MW). Hashrate Index backtest 2024-2025: 100% 4CP recall, 14-67 curtailment hours per month depending on when the peak set (2026-06-04).

Risks
- 12CP with 30-minute intervals likely by 2026-12-31: rebuild as a 12-month peak tracker on the same data.
- Settlement vs operational gap: the official interval is unknowable in real time because of storage and DC-tie adjustments.
- ERCOT API needs an account; Open-Meteo is non-commercial, so use NWS.
- Competition: Grid Status 4CP Monitor (paid), Enverus, Amperon.
- Legal: a free hit-rate dashboard is low exposure; disclaim savings, no reliance.

Agent verdict (1-5): not LLM-substitutable 4; surprise 4; business credibility 4; self-generating proof 5; feasibility 3; 2-minute demo 4.
Skipped by agent: ESIG deck (damaged PDF), Enverus and Grid Status pages behind 403, Oncor current tariff PDF. Vistra savings table is retail-provider marketing, not a tariff sheet.

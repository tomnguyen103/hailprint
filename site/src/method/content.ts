// The Method pages as typed blocks. Facts come from GLOSSARY.md, CLAUDE.md, and docs/DECISIONS.md.
// shortcut: the Method content is one TS file, upgrade to Markdown with a renderer when a second author edits it
import type { MethodPage } from "../router";
import { METHOD_LABELS } from "../router";
import { CAVEAT } from "../shell/caveat";

export type FigureId = "receipt" | "stamp" | "ruler" | "grid" | "guess";

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "prose"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "caveat"; text: string }
  | { kind: "figure"; id: FigureId };

export interface Page {
  title: string;
  blocks: Block[];
}

export const METHOD_CONTENT: Record<MethodPage, Page> = {
  data: {
    title: METHOD_LABELS.data,
    blocks: [
      {
        kind: "prose",
        text:
          "The pipeline reads three sources. MRMS MESH comes from the public S3 bucket noaa-mrms-pds as gzipped GRIB2 files. " +
          "SPC publishes a preliminary hail CSV for each day. HCAD publishes the Harris County parcel geodatabase.",
      },
      { kind: "heading", text: "Published files per storm date" },
      {
        kind: "list",
        items: [
          "swath.geojson: one dissolved polygon per size class.",
          "reports.geojson: the SPC reports within 50 km of the county outline.",
          "pairs.json: the metre distance from each report to each size class, free of any radius.",
          "zip-counts.json: distinct parcels per size class and per ZIP code, where parcels ran.",
        ],
      },
      { kind: "figure", id: "receipt" },
      {
        kind: "prose",
        text:
          "Every published file carries a receipt: the source, the product, the file, the run time, the package version, and the confidence band. " +
          "Every value on the site is a radar-estimated hail size.",
      },
    ],
  },
  "storm-date": {
    title: METHOD_LABELS["storm-date"],
    blocks: [
      {
        kind: "prose",
        text:
          "A storm date is the SPC convective day. Day D runs from 12:00 UTC on D to 12:00 UTC on D+1. " +
          "The daily max for D is the one MESH_Max_1440min file stamped 12:00 UTC in the D+1 folder. " +
          "A report time in CST minus 6 hours gives its storm date.",
      },
      { kind: "list", items: ["Folder: D+1.", "File stamp: -120000.", "Product: MESH_Max_1440min_00.50."] },
      { kind: "figure", id: "stamp" },
      {
        kind: "prose",
        text: "The storm stamp shows the 24 hours from 12Z to 12Z. A filled cell marks an hour with at least one report.",
      },
    ],
  },
  "size-classes": {
    title: METHOD_LABELS["size-classes"],
    blocks: [
      {
        kind: "prose",
        text:
          "A size class is one hail-size threshold in millimetres. The seven thresholds are 19.05, 25.4, 31.75, 38.1, 44.45, 50.8, and 63.5 mm, or 0.75 to 2.5 inches. " +
          "The swath for a class is the dissolved polygon of every cell at or above that threshold. " +
          "The classes nest: a cell in the 2.5 inch class is in every smaller class.",
      },
      {
        kind: "list",
        items: [
          "Sentinel cells -3 and -1 are masked before any arithmetic.",
          "Every value is a radar-estimated hail size, not a ground measurement.",
        ],
      },
      { kind: "figure", id: "ruler" },
      { kind: "prose", text: "The size ruler draws each class at true relative diameter with its object name." },
    ],
  },
  scoring: {
    title: METHOD_LABELS.scoring,
    blocks: [
      {
        kind: "prose",
        text:
          "The sample unit is the scored report. A size class is a forecast for a report when its swath lies within the scoring radius. " +
          "The default radius is 5 km and the maximum is 20 km. A report within the radius plus 1 km of the crop edge is not scored.",
      },
      {
        kind: "list",
        items: [
          "Hit: a report at or above the class with the swath within the radius.",
          "Miss: a report at or above the class with no swath within the radius.",
          "False alarm: a report below the class with the swath within the radius.",
          "Correct negative: a report below the class with no swath within the radius.",
        ],
      },
      { kind: "figure", id: "grid" },
      {
        kind: "prose",
        text:
          "POD, FAR, CSI, and HSS come from the four counts. " +
          "The pooled table sums the counts across every storm date at one radius and recomputes the metrics.",
      },
      { kind: "figure", id: "guess" },
      { kind: "prose", text: "Guess the pooled HSS before the site reveals it. The literature skill is about 0.38 at 30 mm." },
    ],
  },
  limits: {
    title: METHOD_LABELS.limits,
    blocks: [
      {
        kind: "prose",
        text:
          "Hailprint covers Harris County only and HCAD footprints only. SPC reports are preliminary and sparse. " +
          "No ground truth of hail size exists at a parcel. " +
          "The unverifiable area is swath farther than the scoring radius from every report; no report can confirm or deny hail there.",
      },
      {
        kind: "list",
        items: [
          "Harris County, TX, HCAD parcels.",
          "SPC preliminary hail reports within 50 km.",
          "One 12Z daily max per storm date.",
          "Parcel counts, never a value at one address.",
        ],
      },
      { kind: "caveat", text: CAVEAT },
    ],
  },
};

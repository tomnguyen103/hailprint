import { describe, expect, it } from "vitest";
import type { PooledRow } from "../pool";
import { csvOf } from "./csv";

const HEADER =
  "threshold_mm,threshold_in,label,report_count,hits,misses,false_alarms,correct_negatives,pod,far,csi,hss,swath_km2,unverifiable_km2";

function row(over: Partial<PooledRow> = {}): PooledRow {
  return {
    threshold_mm: 19.05,
    threshold_in: 0.75,
    label: ">= 0.75 in",
    report_count: 17,
    hits: 5,
    misses: 2,
    false_alarms: 3,
    correct_negatives: 7,
    pod: 0.7142857142857143,
    far: 0.375,
    csi: 0.5,
    hss: 0.4,
    swath_km2: 123.4,
    unverifiable_km2: 5.6,
    ...over,
  };
}

describe("csvOf", () => {
  it("starts with the spec header", () => {
    expect(csvOf([row()]).split("\n")[0]).toBe(HEADER);
  });

  it("writes a null metric as an empty cell and never the text null", () => {
    const text = csvOf([row({ hss: null })]);
    const cells = text.split("\n")[1]?.split(",") ?? [];
    expect(cells[10]).toBe("0.5");
    expect(cells[11]).toBe("");
    expect(cells[12]).toBe("123.4");
    expect(text).not.toContain("null");
  });

  it("ends with one newline and holds one line per row", () => {
    const text = csvOf([row(), row({ threshold_mm: 25.4 })]);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n")).toHaveLength(4);
  });

  it("quotes a label with a comma or a quote", () => {
    expect(csvOf([row({ label: 'a, "b"' })]).split("\n")[1]).toContain('"a, ""b"""');
  });

  it("prefixes leading formula triggers and control characters with a single quote", () => {
    for (const prefix of ["=cmd", "+1", "-2", "@sum", "\t=cmd"]) {
      const line = csvOf([row({ label: prefix })]).split("\n")[1]!;
      expect(line.split(",")[2]).toBe(`'${prefix}`);
    }
    expect(csvOf([row({ label: "\r=cmd" })])).toContain('"\'\r=cmd"');
  });
});

describe("zipCsvOf", () => {
  it("formats ZIP parcel rows with storm_date, threshold_mm, zip, parcel_count, and share_of_class", async () => {
    const { zipCsvOf } = await import("./csv");
    const csv = zipCsvOf(
      [
        { zip: "77002", parcel_count: 25, share: 0.25 },
        { zip: "77003", parcel_count: 75, share: 0.75 },
      ],
      "2024-05-28",
      19.05,
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("storm_date,threshold_mm,zip,parcel_count,share_of_class");
    expect(lines[1]).toBe("2024-05-28,19.05,77002,25,0.25");
    expect(lines[2]).toBe("2024-05-28,19.05,77003,75,0.75");
  });
});

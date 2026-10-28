// The fill spec of one impact layer: its edges, bin names, legend labels, and the one bin rule.
// Pure: the power layer and the internet layer each build their spec on `binOf`.

export interface FillSpec<B extends string> {
  /** The value where each filled bin after the first starts. */
  readonly edges: readonly number[];
  /** The filled bins, lightest first: one more than the edges. */
  readonly bins: readonly B[];
  /** The legend text of each filled bin. */
  readonly labels: readonly string[];
  /** `gap` for a missing value, `none` for a value of 0 or below, else the filled bin. */
  bin(value: number | null): B | "none" | "gap";
}

export function binOf<B extends string>(edges: readonly number[], bins: readonly B[], value: number | null): B | "none" | "gap" {
  if (value === null || Number.isNaN(value)) return "gap";
  if (value <= 0) return "none";
  return bins[edges.filter((edge) => value >= edge).length]!;
}

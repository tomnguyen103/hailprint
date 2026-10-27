import type { Phenomena } from "../data/types";

export interface WarningStyle {
  name: string;
  token: string;
  /** Dash and gap lengths in line widths; null is a solid line. */
  dash: number[] | null;
}

/** Line style tells the types apart: dashed SV, solid TO, dotted FF. The colour token only adds. */
export const WARNING_STYLES: Record<Phenomena, WarningStyle> = {
  SV: { name: "Severe thunderstorm", token: "--warn-sv", dash: [4, 2] },
  TO: { name: "Tornado", token: "--warn-to", dash: null },
  FF: { name: "Flash flood", token: "--warn-ff", dash: [1, 2] },
};

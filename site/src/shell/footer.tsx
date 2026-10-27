import { Appearance } from "./appearance";

export const CAVEAT = "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.";

export function Footer() {
  return (
    <footer class="site-footer">
      <p class="caveat">{CAVEAT}</p>
      <Appearance />
    </footer>
  );
}
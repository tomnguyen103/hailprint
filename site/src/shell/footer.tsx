import { Appearance } from "./appearance";
import { CAVEAT } from "./caveat";

export function Footer() {
  return (
    <footer class="site-footer">
      <p class="caveat">{CAVEAT}</p>
      <Appearance />
    </footer>
  );
}
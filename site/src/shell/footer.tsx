import { CAVEAT } from "./caveat";

const SOURCE_URL = "https://github.com/tomnguyen103/hailprint";

export function Footer() {
  return (
    <footer class="site-footer">
      <p class="caveat">{CAVEAT}</p>
      <a href={SOURCE_URL} rel="noopener">
        Source code
      </a>
    </footer>
  );
}

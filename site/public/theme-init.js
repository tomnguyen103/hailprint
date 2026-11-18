// Stamp the resolved theme before first paint. Mirrors resolve() and read() in src/theme.ts.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch (error) {
    stored = null;
  }
  var resolved =
    stored === "light" || stored === "dark"
      ? stored
      : typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  var root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
})();

import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import { render } from "preact";
import { App } from "./app";

const host = document.getElementById("app");
if (!host) throw new Error("index.html lacks #app");
// The harness installs its fake fetch before the first render. The build drops the branch.
if (import.meta.env.DEV) (await import("./dev/harness")).install();
render(<App />, host);
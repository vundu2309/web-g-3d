import { start } from "./app/start";
import "@fontsource/baloo-2/latin-800.css";
import "@fontsource/baloo-2/vietnamese-800.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing application root");
const dispose =
  new URLSearchParams(location.search).get("view") === "game"
    ? (await import("./app/play")).startPlay(root)
    : start(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);

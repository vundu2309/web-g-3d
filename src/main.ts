import { start } from "./app/start";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const button = document.querySelector<HTMLButtonElement>("#waves");
const status = document.querySelector<HTMLElement>("#status");
if (!canvas || !button || !status)
  throw new Error("Missing application elements");

let dispose: (() => void) | undefined;
let active = true;
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    active = false;
    dispose?.();
  });

start(canvas, button)
  .then((cleanup) => {
    if (!active) {
      cleanup();
      return;
    }
    dispose = cleanup;
    status.textContent = "Kéo để nhìn quanh · Chụm hai ngón để thu phóng";
  })
  .catch((error: unknown) => {
    console.error(error);
    if (active)
      status.textContent =
        "Không khởi động được 3D. Hãy kiểm tra WebGL và tải lại trang.";
  });

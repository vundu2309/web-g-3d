import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

export function launchBrowser() {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  return chromium.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
}

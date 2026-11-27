// Which browser tests fit a set of changed files (`node scripts/qa.mjs --changed`), and how a
// failing test's output is shown. No side effects, so the unit tests can load it.

/** In a row: also run the fallback group (a shared file whose tests are not all in the group). */
const GROUP = "*";

/**
 * Changed path to browser test names (tests/<name>-browser.mjs). A file that a few tests cover on
 * their own names them. A shared file either has no row (the fallback group) or names GROUP and the
 * tests outside the group that cover it. When a test starts to cover a file, add it here.
 */
const ROWS = [
  [/^src\/app\/(big-map|minimap)\.ts$/, ["ocean-map"]],
  [/^src\/ocean\/minimap-math\.ts$/, ["ocean-map"]],
  [
    /^src\/app\/hub-shell\.ts$/,
    [
      "ocean-audio",
      "ocean-book",
      "ocean-cast",
      "ocean-event",
      "ocean-fishing",
      "ocean-input",
      "ocean-loading",
      "ocean-market",
      "ocean-presence",
      "ocean-quests",
      "ocean-rank",
      "ocean-server-store",
    ],
  ],
  [/^src\/app\/book-ui\.ts$/, ["ocean-book", "ocean-event", "ocean-quests"]],
  [/^src\/ocean\/quests\.ts$/, ["ocean-quests"]],
  [
    /^src\/ocean\/event-board\.ts$/,
    ["ocean-event", "ocean-quests", "ocean-rank"],
  ],
  [/^src\/ocean\/collection\.ts$/, ["ocean-book"]],
  [
    /^src\/(app\/rank-ui|ocean\/leaderboard)\.ts$/,
    ["ocean-rank", "ocean-quests"],
  ],
  [
    /^src\/(app\/market-ui|ocean\/market-prices)\.ts$/,
    ["ocean-market", "ocean-paint", "ocean-quests"],
  ],
  [/^src\/ocean\/paint\.ts$/, ["ocean-paint", "ocean-market"]],
  [/^src\/ocean\/market\.ts$/, [GROUP, "ocean-map"]],
  [
    /^src\/(app\/(audio|settings-audio)|ocean\/audio-[a-z-]+)\.ts$/,
    ["ocean-audio"],
  ],
  [
    /^src\/app\/fishing-ui\.ts$/,
    [
      GROUP,
      "ocean-fishing",
      "ocean-cast",
      "ocean-input",
      "ocean-server-store",
      "ocean-resume",
    ],
  ],
  [
    /^src\/ocean\/input-layer\.ts$/,
    ["ocean-input", "ocean-cast", "ocean-stick", "ocean-steer", "ocean-map"],
  ],
  [/^src\/ocean\/stick\.ts$/, ["ocean-stick", "ocean-steer", "ocean-input"]],
  [/^src\/ocean\/boat-control\.ts$/, ["ocean-steer"]],
  [/^src\/ocean\/(plane-[a-z-]+|banner)\.ts$/, ["ocean-planes"]],
  [
    /^src\/ocean\/patrol-(routes|boat)\.ts$/,
    ["ocean-patrol", "ocean-patrol-collision"],
  ],
  [
    /^src\/ocean\/patrol-light[a-z-]*\.ts$/,
    ["ocean-patrol", "ocean-patrol-collision", "ocean-fade"],
  ],
  [/^src\/ocean\/(world-event|event-ring)\.ts$/, ["ocean-event"]],
  [/^src\/ocean\/server-store\.ts$/, ["ocean-server-store"]],
  [
    /^src\/ocean\/distance-fade\.ts$/,
    ["ocean-fade", "ocean-planes", "ocean-event"],
  ],
  [/^src\/(app|platform)\/account\.ts$/, ["account-signup", "harbor"]],
  [/^src\/(app\/harbor|ui\/hub-canvas)\.ts$/, ["harbor"]],
  [
    /^src\/app\/ocean\.ts$/,
    [
      GROUP,
      "ocean-loading",
      "ocean-parked",
      "ocean-presence",
      "ocean-resume",
      "ocean-resume-pose",
    ],
  ],
  [/^src\/ocean\/save\.ts$/, [GROUP, "ocean-resume", "ocean-resume-pose"]],
  [/^(src\/main\.ts|index\.html)$/, [GROUP, "harbor", "boot-fallback"]],
  [/^server\//, ["ocean-multiplayer"]],
  [/^src\/platform\/ocean(-socket)?\.ts$/, [GROUP, "ocean-multiplayer"]],
  [/^src\/ocean\/style\.css$/, [GROUP, "harbor", "ocean-map"]],
  [
    /^tests\/support\/tap\.mjs$/,
    [
      "ocean-book",
      "ocean-event",
      "ocean-fishing",
      "ocean-map",
      "ocean-market",
      "ocean-paint",
      "ocean-presence",
      "ocean-quests",
      "ocean-rank",
      "ocean-resume",
      "ocean-server-store",
    ],
  ],
  [
    /^tests\/support\/fast-sea\.mjs$/,
    [
      "ocean-arrow",
      "ocean-book",
      "ocean-map",
      "ocean-presence",
      "ocean-rank",
      "ocean-server-store",
    ],
  ],
  [
    /^tests\/support\/supabase-dev\.mjs$/,
    ["account-signup", "ocean-multiplayer"],
  ],
];

/** A change here can alter what a browser test sees. Docs, SQL and unit tests cannot. */
const RELEVANT =
  /^(src|server|public)\/|^tests\/(support\/|browser\.mjs$)|^scripts\/(qa\.mjs$|lib\/|service-worker\.js$|pwa-build\.mjs$)|^(index\.html|vite\.config\.ts|tsconfig\.json|package(-lock)?\.json)$/;

/** tests/pwa-browser.mjs builds and serves the app itself: it is named here, never picked. */
const PWA =
  /^(public\/|scripts\/(service-worker\.js|pwa-build\.mjs)$|tests\/pwa-browser\.mjs$|src\/(app\/pwa|platform\/(pwa|update-check))\.ts$)/;
const PWA_NOTE =
  "the PWA test is not picked here: run node scripts/qa.mjs pwa (it makes its own build)";

/**
 * The tests for `files` (repository paths). A relevant file with no row adds the `fallback` group,
 * and `unmatched` names those files. `notes` says what has to be run by hand.
 */
export function testsFor(files, fallback) {
  const tests = new Set();
  const unmatched = [];
  const notes = new Set();
  let group = false;
  for (const file of files) {
    if (PWA.test(file)) notes.add(PWA_NOTE);
    const own = /^tests\/(.+)-browser\.mjs$/.exec(file);
    if (own) {
      if (own[1] !== "pwa") tests.add(own[1]);
      continue;
    }
    if (!RELEVANT.test(file)) continue;
    const rows = ROWS.filter(([pattern]) => pattern.test(file));
    if (!rows.length) unmatched.push(file);
    for (const [, names] of rows)
      for (const name of names)
        if (name === GROUP) group = true;
        else tests.add(name);
  }
  if (group || unmatched.length) for (const name of fallback) tests.add(name);
  return { tests: [...tests], unmatched, notes: [...notes] };
}

/** Every test name the table can pick (a unit test checks that each has a file). */
export const tableTests = () => [
  ...new Set(
    ROWS.flatMap(([, names]) => names).filter((name) => name !== GROUP),
  ),
];

/** A failing run's output, indented under its label. All of it: the assertion is rarely at the end. */
export const failureBlock = (label, output) =>
  `  ${label}:\n    ${output.trim().split("\n").join("\n    ")}`;

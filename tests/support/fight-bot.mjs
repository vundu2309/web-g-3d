// Plays the tug of war for a test: holds the (drawn) fishing button the way a careful
// player would, through the input layer. Reads the button's data-* state (never text).
// Careful on purpose: a software-rendered frame can be slow, and a snap is a lost fish.
// Resolves with the phase the fight ended in ("idle" once the fish was landed or lost).
export function fightBot(page, { timeout = 240000 } = {}) {
  return page.evaluate(
    (limit) =>
      new Promise((resolve) => {
        const button = document.querySelector('[data-ocean="fish"]');
        const layer = document.querySelector(".ocean-input");
        const id = 11;
        let holding = false;
        const started = performance.now();
        const send = (type) => {
          const box = button.getBoundingClientRect();
          layer.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: id,
              isPrimary: true,
              button: 0,
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
            }),
          );
        };
        const timer = setInterval(() => {
          const phase = button.dataset.phase;
          if (phase !== "fighting" || performance.now() - started > limit) {
            if (holding) send("pointerup");
            clearInterval(timer);
            resolve(phase === "fighting" ? "timeout" : phase);
            return;
          }
          const mood = button.dataset.mood;
          const tension = Number(button.dataset.tension);
          const want =
            mood === "tired" || (mood === "strong" && tension < 0.22);
          if (want && !holding) send("pointerdown");
          if (!want && holding) send("pointerup");
          holding = want;
        }, 15);
      }),
    timeout,
  );
}

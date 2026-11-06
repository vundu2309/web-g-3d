// The sea controls are only drawn; one input layer takes the touches. So a test taps
// where the control is, like a finger, instead of asking Playwright to click the button.
export async function tap(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("control has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** An error whose message is written for the player and can be shown as it is. */
export class HubError extends Error {}

/** A display name: one to 24 characters, spaces collapsed, no control characters. */
export function playerName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (
    !name ||
    name.length > 24 ||
    Array.from(name).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    throw new HubError("Tên cần có từ 1 đến 24 ký tự.");
  return name;
}

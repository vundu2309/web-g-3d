/**
 * Switches for finding what costs frames on a device: `?reflect=0`, `?fish=0`, `?props=0`,
 * `?clearwater=0`, `?scale=1` in the page address, or the same set in Settings ("Thử tắt từng
 * phần"), kept on this device (an installed app has no address bar). The address wins.
 */
const KEY = "sea-probe";
export const PROBES = [
  { name: "reflect", off: "0", label: "Tắt phản chiếu nước" },
  { name: "fish", off: "0", label: "Tắt đàn cá" },
  { name: "props", off: "0", label: "Tắt dừa, bụi, nhà, đá" },
  { name: "clearwater", off: "0", label: "Tắt nước trong suốt" },
  { name: "scale", off: "1", label: "Độ phân giải 1x" },
] as const;

const stored = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

export const probe = (name: string): string | null => {
  try {
    const fromAddress = new URLSearchParams(window.location.search).get(name);
    if (fromAddress !== null) return fromAddress;
  } catch {
    /* no window: nothing set */
  }
  return stored()[name] ?? null;
};

export const setProbe = (name: string, value: string | null) => {
  try {
    const all = stored();
    if (value === null) delete all[name];
    else all[name] = value;
    if (Object.keys(all).length)
      window.localStorage.setItem(KEY, JSON.stringify(all));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: the switch just is not remembered */
  }
};

export type Capacity = 2 | 3 | 4;
export interface Player {
  name: string;
  ready: boolean;
  seat: number;
}
export interface Room {
  hostId: string;
  capacity: Capacity;
  status: "waiting" | "started";
  createdAt: number;
  players: Record<string, Player>;
  seats: Record<string, string>;
}
export type Command =
  | { type: "join"; uid: string; name: string }
  | { type: "ready"; uid: string; ready: boolean }
  | { type: "leave"; uid: string }
  | { type: "start"; uid: string };

export class HubError extends Error {}
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
export function roomCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
    throw new HubError("Mã phòng gồm 6 chữ hoặc số, không có I, O, 0, 1.");
  return code;
}
export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (v) => alphabet[v % 32],
  ).join("");
}
export function createRoom(
  uid: string,
  name: string,
  capacity: Capacity,
): Room {
  if (![2, 3, 4].includes(capacity))
    throw new HubError("Chọn từ 2 đến 4 người chơi.");
  return {
    hostId: uid,
    capacity,
    status: "waiting",
    createdAt: Date.now(),
    seats: { "0": uid },
    players: { [uid]: { name: playerName(name), ready: true, seat: 0 } },
  };
}
export function canStart(room: Room): boolean {
  const players = Object.values(room.players);
  return (
    room.status === "waiting" &&
    players.length >= 2 &&
    players.every((p) => p.ready)
  );
}
export function applyCommand(room: Room | null, command: Command): Room | null {
  if (!room)
    throw new HubError(
      "Không tìm thấy phòng. Kiểm tra lại mã hoặc nhờ chủ phòng tạo phòng mới.",
    );
  const next = structuredClone(room);
  const member = next.players[command.uid];
  if (command.type === "join") {
    if (member) return next;
    if (next.status !== "waiting")
      throw new HubError("Phòng đã bắt đầu, hãy tham gia phòng khác.");
    if (Object.keys(next.players).length >= next.capacity)
      throw new HubError("Phòng đã đủ người chơi.");
    const used = Object.values(next.players).map((p) => p.seat);
    const seat = [0, 1, 2, 3].find((v) => !used.includes(v))!;
    next.seats[String(seat)] = command.uid;
    next.players[command.uid] = {
      name: playerName(command.name),
      ready: false,
      seat,
    };
  } else {
    if (!member) throw new HubError("Bạn không còn trong phòng này.");
    if (command.type === "leave") {
      if (next.hostId === command.uid) return null;
      delete next.seats[String(member.seat)];
      delete next.players[command.uid];
    } else if (command.type === "ready") {
      if (next.status !== "waiting") throw new HubError("Phòng đã bắt đầu.");
      if (next.hostId === command.uid)
        throw new HubError("Chủ phòng luôn sẵn sàng.");
      member.ready = command.ready;
    } else {
      if (next.hostId !== command.uid)
        throw new HubError("Chỉ chủ phòng có thể bắt đầu.");
      if (!canStart(next))
        throw new HubError("Cần ít nhất 2 người và tất cả đã sẵn sàng.");
      next.status = "started";
    }
  }
  return next;
}

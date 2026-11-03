import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  createRoom,
  canStart,
  playerName,
  roomCode,
  generateCode,
} from "../src/hub/model.ts";

test("validate names/codes without interpreting user text as HTML", () => {
  assert.equal(playerName("  Minh   Anh "), "Minh Anh");
  assert.equal(playerName("<b>Lan</b>"), "<b>Lan</b>");
  for (const name of ["", " ", "x".repeat(25), "a\u0000b"])
    assert.throws(() => playerName(name));
  assert.equal(roomCode(" ab7k2m "), "AB7K2M");
  for (const code of ["123", "ABC0OI", "ABCDEF1", "<a>123"])
    assert.throws(() => roomCode(code));
  for (let i = 0; i < 100; i++)
    assert.equal(roomCode(generateCode()).length, 6);
});
test("capacity and last seat enforce room limit without mutating previous snapshots", () => {
  const room = createRoom("host", "Minh", 2);
  const joined = applyCommand(room, {
    type: "join",
    uid: "guest",
    name: "Lan",
  });
  assert.equal(Object.keys(room.players).length, 1);
  assert.equal(Object.keys(joined.players).length, 2);
  assert.throws(
    () => applyCommand(joined, { type: "join", uid: "extra", name: "Huy" }),
    /đủ/,
  );
  assert.deepEqual(
    applyCommand(joined, { type: "join", uid: "guest", name: "Lan" }),
    joined,
  );
});
test("only host can start and all present players must be ready, empty optional seats do not block", () => {
  let room = createRoom("host", "Minh", 4);
  assert.equal(canStart(room), false);
  room = applyCommand(room, { type: "join", uid: "guest", name: "Lan" });
  assert.throws(
    () => applyCommand(room, { type: "start", uid: "host" }),
    /sẵn sàng/,
  );
  assert.throws(
    () => applyCommand(room, { type: "start", uid: "guest" }),
    /chủ phòng/,
  );
  room = applyCommand(room, { type: "ready", uid: "guest", ready: true });
  assert.equal(canStart(room), true);
  assert.throws(() =>
    applyCommand(room, { type: "ready", uid: "stranger", ready: true }),
  );
  room = applyCommand(room, { type: "start", uid: "host" });
  assert.equal(room.status, "started");
  assert.throws(
    () => applyCommand(room, { type: "join", uid: "late", name: "Huy" }),
    /đã bắt đầu/,
  );
  assert.throws(() =>
    applyCommand(room, { type: "ready", uid: "guest", ready: false }),
  );
});
test("host closes room, guest leaves independently and vacant seat is reused", () => {
  let room = createRoom("host", "Minh", 3);
  room = applyCommand(room, { type: "join", uid: "first", name: "Lan" });
  room = applyCommand(room, { type: "join", uid: "second", name: "Huy" });
  room = applyCommand(room, { type: "leave", uid: "first" });
  assert.equal(room.players.second.seat, 2);
  room = applyCommand(room, { type: "join", uid: "third", name: "Vy" });
  assert.equal(room.players.third.seat, 1);
  assert.equal(applyCommand(room, { type: "leave", uid: "host" }), null);
  assert.throws(
    () => applyCommand(null, { type: "join", uid: "late", name: "Lan" }),
    /Không tìm thấy/,
  );
});

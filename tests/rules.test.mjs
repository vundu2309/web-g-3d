import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { createRoom, applyCommand } from "../src/hub/model.ts";
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ""))
  throw new Error("Only a loopback Firestore emulator is permitted");
const env = await initializeTestEnvironment({
  projectId: "demo-photyphu",
  firestore: { rules: await readFile("firestore.rules", "utf8") },
});
const database = (uid, provider = "password") =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: provider } })
    .firestore();
const host = database("host"),
  guest = database("guest"),
  outsider = database("outsider"),
  anonymous = database("anonymous", "anonymous"),
  unauth = env.unauthenticatedContext().firestore();
const path = "monopolyHub/v1/rooms/AB7K2M";
try {
  await test("shared ocean: authenticated reads, own validated boat only, bounded directory", async () => {
    const ref = (db, uid = "host") =>
      doc(db, `monopolyHub/v1/oceanBoats/${uid}`);
    const boat = () => ({
      name: "Minh",
      session: "one",
      x: 0,
      z: 0,
      heading: 0,
      fishing: false,
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(ref(host), boat()));
    await assertSucceeds(getDoc(ref(guest)));
    await assertFails(getDoc(ref(unauth)));
    await assertFails(getDoc(ref(anonymous)));
    await assertFails(setDoc(ref(guest), boat()));
    await assertFails(
      updateDoc(ref(guest), { x: 1, updatedAt: serverTimestamp() }),
    );
    await assertFails(deleteDoc(ref(guest)));
    const directory = (db) =>
      query(
        collection(db, "monopolyHub/v1/oceanBoats"),
        orderBy("updatedAt", "desc"),
        limit(100),
      );
    await assertSucceeds(getDocs(directory(guest)));
    await assertFails(getDocs(directory(unauth)));
    await assertFails(getDocs(collection(host, "monopolyHub/v1/oceanBoats")));
    await assertFails(
      getDocs(query(collection(host, "monopolyHub/v1/oceanBoats"), limit(101))),
    );
    for (const bad of [
      { name: "x".repeat(25) },
      { x: 181 },
      { z: "0" },
      { heading: 4 },
      { session: "" },
      { fishing: 1 },
      { updatedAt: Timestamp.fromMillis(1) },
      { extra: "injected" },
      { role: "admin" },
    ]) {
      await assertFails(setDoc(ref(host), { ...boat(), ...bad }));
      await assertFails(
        updateDoc(ref(host), {
          ...bad,
          ...(Object.hasOwn(bad, "updatedAt")
            ? {}
            : { updatedAt: serverTimestamp() }),
        }),
      );
    }
    const missing = boat();
    delete missing.fishing;
    await assertFails(setDoc(ref(host), missing));
    await assertSucceeds(
      updateDoc(ref(host), {
        x: 1,
        fishing: true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(deleteDoc(ref(host)));
  });
  await test("Firestore rules: profile isolation/schema, bounded query, immutable ownership and readiness", async () => {
    for (const [uid, name, db] of [
      ["host", "Minh", host],
      ["guest", "Lan", guest],
      ["outsider", "Huy", outsider],
    ])
      await assertSucceeds(
        setDoc(doc(db, `monopolyHub/v1/profiles/${uid}`), {
          displayName: name,
          createdAt: serverTimestamp(),
        }),
      );
    await assertFails(getDoc(doc(guest, "monopolyHub/v1/profiles/host")));
    await assertFails(
      updateDoc(doc(guest, "monopolyHub/v1/profiles/host"), {
        displayName: "Fake",
      }),
    );
    await assertFails(
      updateDoc(doc(host, "monopolyHub/v1/profiles/host"), { role: "admin" }),
    );
    await assertFails(
      updateDoc(doc(host, "monopolyHub/v1/profiles/host"), {
        displayName: "x".repeat(10000),
      }),
    );
    await assertFails(
      updateDoc(doc(host, "monopolyHub/v1/profiles/host"), {
        createdAt: Timestamp.fromMillis(1),
      }),
    );
    await assertSucceeds(getDoc(doc(unauth, "legacyMovieapp/sample")));
    let room = createRoom("host", "Minh", 2, "Bạn bè");
    const write = (db, data) =>
      setDoc(doc(db, path), {
        ...data,
        createdAt: storedTime || serverTimestamp(),
      });
    let storedTime;
    await assertFails(write(guest, room));
    await assertFails(getDoc(doc(unauth, path)));
    await assertFails(getDoc(doc(anonymous, path)));
    await assertSucceeds(write(host, room));
    storedTime = (await getDoc(doc(host, path))).data().createdAt;
    const directory = (db) =>
      query(
        collection(db, "monopolyHub/v1/rooms"),
        where("status", "==", "waiting"),
        orderBy("createdAt", "desc"),
        limit(50),
      );
    await assertSucceeds(getDocs(directory(guest)));
    await assertFails(getDocs(directory(unauth)));
    await assertFails(getDocs(collection(guest, "monopolyHub/v1/rooms")));
    await assertFails(
      getDocs(
        query(
          collection(guest, "monopolyHub/v1/rooms"),
          where("status", "==", "waiting"),
          limit(51),
        ),
      ),
    );
    await assertFails(write(host, { ...room, title: "Đổi" }));
    await assertFails(write(host, { ...room, capacity: 4 }));
    await assertFails(write(host, { ...room, hostId: "guest" }));
    await assertFails(write(host, { ...room, title: "x".repeat(10000) }));
    await assertFails(write(host, { ...room, title: 42 }));
    const missing = { ...room };
    delete missing.title;
    await assertFails(write(host, missing));
    await assertFails(write(host, { ...room, extra: "pollution" }));
    await assertFails(
      write(outsider, {
        ...room,
        players: {
          ...room.players,
          outsider: { name: "Huy", ready: false, seat: 0 },
        },
        seats: { ...room.seats, 1: "" },
      }),
    );
    room = applyCommand(room, { type: "join", uid: "guest", name: "Lan" });
    await assertFails(
      write(guest, {
        ...room,
        players: {
          ...room.players,
          guest: { ...room.players.guest, name: "Fake" },
        },
      }),
    );
    await assertSucceeds(write(guest, room));
    await assertFails(
      write(outsider, {
        ...room,
        seats: { ...room.seats, 2: "outsider" },
        players: {
          ...room.players,
          outsider: { name: "Huy", seat: 2, ready: false },
        },
      }),
    );
    await assertFails(deleteDoc(doc(guest, path)));
    await assertFails(
      write(guest, {
        ...room,
        players: { guest: room.players.guest },
        seats: { 1: "guest" },
      }),
    );
    await assertFails(write(host, { ...room, status: "started" }));
    await assertFails(write(guest, { ...room, status: "started" }));
    room = applyCommand(room, { type: "ready", uid: "guest", ready: true });
    await assertSucceeds(write(guest, room));
    await assertFails(write(guest, { ...room, status: "started" }));
    room = applyCommand(room, { type: "start", uid: "host" });
    await assertSucceeds(write(host, room));
    await assertFails(write(host, { ...room, status: "waiting" }));
    await assertFails(
      write(guest, {
        ...room,
        players: {
          ...room.players,
          guest: { ...room.players.guest, ready: false },
        },
      }),
    );
    await assertSucceeds(
      write(guest, applyCommand(room, { type: "leave", uid: "guest" })),
    );
    await assertSucceeds(deleteDoc(doc(host, path)));
    assert.equal((await getDoc(doc(host, path))).exists(), false);
    const racePath = "monopolyHub/v1/rooms/AB7K2N";
    await assertSucceeds(
      setDoc(doc(host, racePath), {
        ...createRoom("host", "Minh", 2),
        createdAt: serverTimestamp(),
      }),
    );
    const joinRace = (db, uid, name) =>
      runTransaction(db, async (transaction) => {
        const reference = doc(db, racePath);
        const snapshot = await transaction.get(reference);
        const data = snapshot.data();
        const next = applyCommand(
          { ...data, createdAt: data.createdAt.toMillis() },
          { type: "join", uid, name },
        );
        transaction.set(reference, { ...next, createdAt: data.createdAt });
      });
    const results = await Promise.allSettled([
      joinRace(guest, "guest", "Lan"),
      joinRace(outsider, "outsider", "Huy"),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
      "only one concurrent last-seat join commits",
    );
    assert.equal(
      Object.keys((await getDoc(doc(host, racePath))).data().players).length,
      2,
    );
    await assertSucceeds(deleteDoc(doc(host, racePath)));
  });
} finally {
  await env.cleanup();
}

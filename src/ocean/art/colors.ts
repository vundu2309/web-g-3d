/**
 * The one place the sea game's object colours are written down, by role. Boats, islands,
 * props, the rod and the gear take their colours from here (never a hex of their own), so
 * the whole sea stays one family and a colour is changed once. Hex numbers (0xRRGGBB).
 * The sea, sky and fog colours are in sea-style.ts and the UI palette in docs/design/theme.md.
 */
export const PAL = {
  /** Planks, masts and posts: four steps from pale to deep, plus trim and the deck pair. */
  wood: {
    trim: 0xc98a4b,
    light: 0xb07c49,
    mid: 0x9b6b3f,
    dark: 0x8a5d36,
    deep: 0x6b4a2b,
    deck: [0xb98757, 0xa57647],
  },
  /** Painted parts shared by boats, lighthouse and buoys. */
  paint: {
    cream: 0xfff7e6,
    creamWarm: 0xfff1c9,
    red: 0xe0554b,
    redDeep: 0xc9573f,
    funnel: 0xb23a32,
    coral: 0xef866a,
    green: 0x2f9a6a,
    window: 0x1d4e73,
    net: 0x7ea0b8,
    crate: 0xffb93d,
    crateLid: 0xc77f1b,
    white: 0xf6f8fa,
  },
  /** Hull bands below the palette colour. */
  hull: { boot: 0xfff3d6, waterline: 0x8c3a35 },
  metal: { steel: 0x4b4f56, light: 0xcfd6df },
  light: { lamp: 0xffe28a },
  stone: { rock: 0x8d9298, dark: 0x757b83, moss: 0x6f9a58, night: 0x2b3a4a },
  sand: { wet: 0xc9b27b, dry: 0xf2dca2 },
  plants: {
    grassLow: 0x7bbf6e,
    grassHigh: 0x4b9a5a,
    grassDry: 0xb3bf67,
    blades: [0x6fb85f, 0x5aa856, 0x8cc766, 0xa9c860],
    leaves: [0x3f9b57, 0x4fae63, 0x6cbb5f, 0x358a52],
    frond: 0x5cba6e,
    flowers: [0xfff3a8, 0xffffff, 0xff9fb3, 0xff8a5c, 0xc79bff],
    shells: [0xfff1dc, 0xf6c9c0, 0xf2b27a, 0xe9e1d0],
    berries: [0xf08a4b, 0xe9573f],
  },
  gull: { grey: 0xc9d0d8, dark: 0x3b4048, beak: 0xf2b640 },
  /** The small hut and rowboat on each island. */
  hut: { wall: 0xf3e3b8, glass: 0x8fd0e8, rowboat: 0x3a6ea5 },
  /** The fisherman on the boat. */
  crew: { coat: 0xffc83d, trousers: 0x2f5d8a, skin: 0xf2b98f, hat: 0xe9c46a },
  /** The rod and the lure. */
  rod: { cork: 0xe3c38d, graphite: 0x6b4423, tip: 0xff7a2e, lure: 0xff7333 },
  /** The throw marker: no water and the sweet spot (otherwise white). */
  signal: { blocked: 0xff594d, sweet: 0x73ff99 },
} as const;

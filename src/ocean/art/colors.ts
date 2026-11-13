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
  /** Fittings on the boat: glass, frames, tyre fenders, rope, barrels, winch. */
  fit: {
    glass: 0xa6dcf0,
    frame: 0xf4efe2,
    rubber: 0x2b2f36,
    rope: 0xd9c08a,
    barrel: 0x3f78b5,
    door: 0x7f5a3a,
    winch: 0xe2a52a,
    anchor: 0x3a3f47,
    boots: 0x242830,
    belt: 0x5a3b22,
  },
  /** The fish markets: awning, sign board, coin and the silver of the fish on display. */
  market: { board: 0x1f4f8f, coin: 0xffd35a, silver: 0xc4d3e0, post: 0x7a5232 },
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
  /**
   * The people and cats of the sea (built in Blender: tools/blender/people.py, vendors.py; the game reads no role from here directly):
   * skin tones, hair, the face and each look's clothes, by role.
   */
  people: {
    skin: {
      fair: 0xf1cba8,
      light: 0xe7b48f,
      tan: 0xcf9a72,
      deep: 0x6e4632,
      warm: 0xdda07c,
    },
    hair: {
      black: 0x1d1917,
      dark: 0x2c211c,
      brown: 0x5b3b28,
      grey: 0xa9a39b,
    },
    face: {
      iris: 0x3b2618,
      white: 0xf4f1ea,
      lash: 0x161212,
      lip: 0xc0716b,
      lipDeep: 0x8c4c44,
    },
    clothes: {
      shirt: 0xf3f1ec,
      button: 0xcfcac0,
      khaki: 0xc6ac82,
      flats: 0x2d2a2b,
      tee: 0x26282d,
      jeans: 0x4b6c9c,
      jeansDark: 0x3d5884,
      sneakerPink: 0xd77eb1,
      sole: 0xf0eee9,
      jacket: 0xab97d8,
      zip: 0x7f68b8,
      top: 0xe9ecf2,
      shorts: 0x76579f,
      sneakerGrey: 0x9ba1a9,
      sock: 0xf8f8f6,
      lime: 0xc2cf3d,
      knit: 0xe98c6c,
      shoeLight: 0xe7dece,
      // The village outfits: ao ba ba shirts, work trousers, sandals, aprons and headwear.
      babaCream: 0xefe3c4,
      babaMaroon: 0x8e3b48,
      babaLilac: 0xa99bd0,
      babaMustard: 0xd9a93a,
      fisherShirt: 0x3b5b7e,
      blackPants: 0x2a2830,
      fisherPants: 0x6a5a48,
      sandal: 0x8b5e3c,
      apronTeal: 0x2f9f96,
      apronRose: 0xd4567a,
      apronSky: 0x7fa6c9,
      hatStraw: 0xe9d48f,
      capNavy: 0x2f4a6b,
      scarfCoral: 0xf0845c,
      scarfBlue: 0x4a86c5,
    },
  },
  /**
   * The rod and the lure. The blank's bands take the player's boat colours (BoatPalette.hull and
   * .trim); these are the parts every rod shares: the cork handle and its butt cap, the reel
   * (body and the knob of its crank), the bright tip, and the colourful lure (back, belly, fins).
   */
  rod: {
    cork: 0xe3c38d,
    cap: 0x4a3b32,
    reel: 0xe5604d,
    accent: 0xffd23f,
    tip: 0xff7a2e,
    lure: 0xff7333,
    belly: 0xfff0d2,
    /** The dark edge drawn behind the fishing line so it shows on bright water and foam. */
    halo: 0x1b2a3c,
  },
  /** The throw marker: no water and the sweet spot (otherwise white). */
  signal: { blocked: 0xff594d, sweet: 0x73ff99 },
} as const;

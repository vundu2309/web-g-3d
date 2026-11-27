import {
  EconomyError,
  type EconomyApi,
  type BuyResult,
  type EconomyState,
  type ImportResult,
  type Profile,
  type SellResult,
} from "../ocean/economy-api";
import { readEventBoard } from "../ocean/event-board";
import { readLeaderboard, readWeeklyBoard } from "../ocean/leaderboard";
import { readCatchResult, readQuests } from "../ocean/quests";
import { loadoutOf } from "../ocean/upgrades";

export * from "../ocean/economy-api";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The economy is on only with the public switch VITE_ECONOMY=on. */
export const economyEnabled = () => import.meta.env.VITE_ECONOMY === "on";

function failureOf(error: {
  code?: string;
  message?: string;
  status?: number;
}) {
  switch (error.code) {
    case "42501":
      return new EconomyError("signin");
    case "55000":
      return new EconomyError("fast");
    case "54000":
      return new EconomyError("full");
    case "22023":
      return new EconomyError("invalid");
    case "EC402":
      return new EconomyError("poor");
    case "EC409":
      return new EconomyError("owned");
    case "EC410":
      return new EconomyError("quest");
    case "EC422":
      return new EconomyError("order");
    case "PGRST202": // the function is not in the schema cache: migration not applied
    case "42883":
      return new EconomyError("closed");
    default:
      return error.status === 404
        ? new EconomyError("closed")
        : new EconomyError("network", error.message);
  }
}

export function supabaseEconomy(): EconomyApi {
  const call = async <T>(name: string, args?: Record<string, unknown>) => {
    const { supabase } = await import("./supabase-client");
    let response;
    try {
      response = await supabase().rpc(name as never, args as never);
    } catch (error) {
      throw new EconomyError("network", String(error));
    }
    if (response.error) throw failureOf(response.error);
    return response.data as T;
  };
  return {
    // A server that has not got the upgrades migration yet answers without a loadout: the
    // defaults then.
    async state(market) {
      let raw: EconomyState;
      try {
        raw = await call<EconomyState>(
          "economy_state",
          market === undefined ? undefined : { p_market: market },
        );
      } catch (error) {
        // A server that has not got the market-prices migration yet has no `p_market`: ask the old way.
        if (
          market === undefined ||
          !(error instanceof EconomyError) ||
          error.failure !== "closed"
        )
          throw error;
        raw = await call<EconomyState>("economy_state");
      }
      return { ...raw, loadout: loadoutOf(raw.loadout) };
    },
    async recordCatch(fish, event) {
      const plain = { p_species: fish.species, p_kg: round2(fish.kg) };
      try {
        return readCatchResult(
          await call(
            "economy_record_catch",
            event === undefined ? plain : { ...plain, p_event: event },
          ),
        );
      } catch (error) {
        // A server without the progression migration has no `p_event`: the fish is still recorded, as before.
        if (
          event === undefined ||
          !(error instanceof EconomyError) ||
          error.failure !== "closed"
        )
          throw error;
        await call("economy_record_catch", plain);
        return undefined;
      }
    },
    profile: () => call<Profile>("economy_profile"),
    async release(species) {
      await call("economy_release", { p_species: species });
    },
    async savePose(pose) {
      await call("economy_save_pose", {
        p_x: round2(pose.x),
        p_z: round2(pose.z),
        p_heading: Math.round(pose.heading * 1000) / 1000,
      });
    },
    importLocal: (fish, caught) =>
      call<ImportResult>("economy_import_local", {
        p_fish: fish,
        p_caught: Math.max(0, Math.floor(caught)),
      }),
    async sell(fish, market, day) {
      const list = fish
        ? fish.map((f) => ({ species: f.species, kg: round2(f.kg) }))
        : null;
      try {
        return await call<SellResult>("economy_sell", {
          p_fish: list,
          ...(market === undefined ? {} : { p_market: market }),
          ...(day === undefined ? {} : { p_day: day }),
        });
      } catch (error) {
        // A server without the market-prices migration: sell at the ordinary price, as before.
        if (
          market === undefined ||
          !(error instanceof EconomyError) ||
          error.failure !== "closed"
        )
          throw error;
        return call<SellResult>("economy_sell", { p_fish: list });
      }
    },
    async buy(kind, tier) {
      const raw = await call<BuyResult>("economy_buy", {
        p_kind: kind,
        p_tier: tier,
      });
      return { coins: raw.coins, loadout: loadoutOf(raw.loadout) };
    },
    async setBait(tier) {
      return loadoutOf(await call("economy_set_bait", { p_tier: tier }));
    },
    async buyPaint(paint) {
      const raw = await call<BuyResult>("economy_buy_paint", {
        p_paint: paint,
      });
      return { coins: raw.coins, loadout: loadoutOf(raw.loadout) };
    },
    async setPaint(paint) {
      return loadoutOf(await call("economy_set_paint", { p_paint: paint }));
    },
    async leaderboard() {
      return readLeaderboard(await call("economy_leaderboard"));
    },
    async quests() {
      return readQuests(await call("economy_quests"));
    },
    async claimQuest(slot) {
      const raw = await call<{ earned?: number; coins?: number }>(
        "economy_quest_claim",
        { p_slot: slot },
      );
      return { earned: Number(raw.earned) || 0, coins: Number(raw.coins) || 0 };
    },
    async weeklyBoard() {
      return readWeeklyBoard(await call("economy_weekly_board"));
    },
    async eventBoard(slot) {
      return readEventBoard(
        await call(
          "economy_event_board",
          slot === undefined ? undefined : { p_slot: slot },
        ),
      );
    },
  };
}

import { useSupabase } from "./online-config";
import {
  EconomyError,
  type EconomyApi,
  type EconomyState,
  type SellResult,
} from "../ocean/economy-api";

export * from "../ocean/economy-api";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The economy is on only with the Supabase backend AND the public switch VITE_ECONOMY=on. */
export const economyEnabled = () =>
  useSupabase && import.meta.env.VITE_ECONOMY === "on";

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
    state: () => call<EconomyState>("economy_state"),
    async recordCatch(fish) {
      await call("economy_record_catch", {
        p_species: fish.species,
        p_kg: round2(fish.kg),
      });
    },
    sell: (fish) =>
      call<SellResult>("economy_sell", {
        p_fish: fish
          ? fish.map((f) => ({ species: f.species, kg: round2(f.kg) }))
          : null,
      }),
  };
}

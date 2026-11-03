import type { Trace } from "./diagnostics";
import type { Capacity, Command, Room } from "./model";
export interface RoomStore {
  readonly uid: string;
  create(
    name: string,
    capacity: Capacity,
    title?: string,
    trace?: Trace,
  ): Promise<string>;
  join(code: string, name: string, trace?: Trace): Promise<void>;
  command(code: string, command: Command): Promise<void>;
  watch(
    code: string,
    update: (room: Room | null, fromCache?: boolean) => void,
    error: (error: unknown) => void,
  ): () => void;
  list(
    update: (rooms: { code: string; room: Room }[]) => void,
    error: (error: unknown) => void,
  ): () => void;
  dispose(): void;
}

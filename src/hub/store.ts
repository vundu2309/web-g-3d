import type { Capacity, Command, Room } from "./model";
export interface RoomStore {
  readonly uid: string;
  create(name: string, capacity: Capacity): Promise<string>;
  join(code: string, name: string): Promise<void>;
  command(code: string, command: Command): Promise<void>;
  watch(
    code: string,
    update: (room: Room | null) => void,
    error: (error: unknown) => void,
  ): () => void;
  dispose(): void;
}

import type { AdviceResponse } from "@/lib/contracts/advice";
import type { ContextForm } from "./context-form";

/**
 * In-memory copy of the current analysis, so returning from a story page
 * restores the results. Module state survives client-side navigation but not
 * a reload, which keeps the dialogue ephemeral: nothing is written to storage.
 */
export interface RememberedSession {
  query: string;
  context: ContextForm;
  contextOpen: boolean;
  response: AdviceResponse | null;
  changedLabel: string | null;
}

let memory: RememberedSession | null = null;

export const recall = (): RememberedSession | null => memory;

export function remember(session: RememberedSession) {
  memory = session;
}

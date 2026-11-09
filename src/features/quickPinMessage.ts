import type { WaMessageKey, WaSendPinMessage } from "zapo-js";
import { PIN_SECONDS } from "../lib/constants.ts";

/** Atajo .f: fijar el mensaje citado durante el plazo habitual del bot (7 días). */
export function quickPinPayload(target: WaMessageKey | null): WaSendPinMessage {
  if (!target || !target.id || !target.remoteJid)
    throw new Error("Respondé al mensaje que querés fijar y escribí *.f*.");
  return { type:"pin", target, durationSecs: PIN_SECONDS };
}

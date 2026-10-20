/**
 * Voice calls for commands. Needs the optional call packages (see src/bot/voip.ts).
 *
 *   import { calls } from "../features/calls.ts";
 *
 *   // Ring someone, play a file when they answer, hang up when it ends:
 *   const result = await calls.ring("2348012345678", "/tmp/hello.mp3");
 *   // result: { answered: true, reason: "user_ended", seconds: 12 }
 *
 *   // Or step by step:
 *   const call = await calls.start(ctx.sender);
 *   if (await call.answered()) {
 *     await call.play("/tmp/hello.mp3"); // waits until the file has played
 *     await call.hangUp();
 *   }
 *
 *   // Ring up to 3 times until they pick up or decline, hang up as soon as they answer:
 *   const outcome = await calls.alert("2348012345678"); // "answered" | "declined" | "missed"
 *
 *   // Answer incoming calls:
 *   calls.onIncoming(async (call) => {
 *     await call.accept();
 *     await call.play("/tmp/welcome.mp3");
 *     await call.hangUp();
 *   });
 */
import { requireClient } from "../bot/client.ts";
import { callsEnabled, playIntoCall, stopCallAudio } from "../bot/voip.ts";
import { phoneToJid } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";

export type CallState = "initiating" | "ringing" | "incoming_ringing" | "connecting" | "active" | "on_hold" | "ended";

/** Why a call ended: "user_ended", "declined", "timeout", "busy", "cancelled", "failed", ... */
export type CallEndReason = string;

interface CallInfo {
  callId: string;
  peerJid: string;
  direction: "outgoing" | "incoming";
  callerPn?: string;
  groupJid?: string;
  stateData: { state: CallState; endReason?: CallEndReason; durationSecs?: number };
}

interface VoipApi {
  startCall(options: { peerJid: string } | { groupJid: string; participants: { jid: string }[] }): Promise<string>;
  acceptCall(callId: string): Promise<void>;
  rejectCall(callId: string): Promise<void>;
  endCall(callId: string): Promise<void>;
  setMute(callId: string, muted: boolean): Promise<void>;
  getCall(callId: string): CallInfo | null;
}

const RING_TIMEOUT_MS = 45_000;

function voip(): VoipApi {
  const api = (requireClient() as unknown as { voip?: VoipApi }).voip;
  if (!api || !callsEnabled()) throw new Error("Calls are not enabled. Install them with: bun add @zapo-js/voip @roamhq/wrtc libmlow-wasm-fork");
  return api;
}

export class Call {
  private info: CallInfo;
  private readonly answeredWaiters: ((answered: boolean) => void)[] = [];
  private readonly endedWaiters: ((reason: CallEndReason) => void)[] = [];

  constructor(info: CallInfo) {
    this.info = info;
  }

  get id(): string {
    return this.info.callId;
  }

  /** The other side's JID. For incoming calls from a LID, `phone` may hold the number. */
  get peer(): string {
    return this.info.peerJid;
  }

  get phone(): string | undefined {
    return this.info.callerPn?.split("@")[0] ?? (this.info.peerJid.endsWith("@s.whatsapp.net") ? this.info.peerJid.split("@")[0] : undefined);
  }

  /** The group's JID on a group call. */
  get group(): string | undefined {
    return this.info.groupJid;
  }

  get direction(): "outgoing" | "incoming" {
    return this.info.direction;
  }

  get state(): CallState {
    return this.info.stateData.state;
  }

  get isActive(): boolean {
    return this.state === "active";
  }

  get isEnded(): boolean {
    return this.state === "ended";
  }

  get endReason(): CallEndReason | undefined {
    return this.info.stateData.endReason;
  }

  /** Seconds the call was connected, once it has ended. */
  get duration(): number | undefined {
    return this.info.stateData.durationSecs;
  }

  /** Resolves true once the call is connected, false if it ends or `timeoutMs` passes first. */
  answered(timeoutMs = RING_TIMEOUT_MS): Promise<boolean> {
    if (this.isActive) return Promise.resolve(true);
    if (this.isEnded) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.answeredWaiters.push((answered) => {
        clearTimeout(timer);
        resolve(answered);
      });
    });
  }

  /** Resolves with the end reason when the call is over. */
  ended(): Promise<CallEndReason> {
    if (this.isEnded) return Promise.resolve(this.endReason ?? "unknown");
    return new Promise((resolve) => this.endedWaiters.push(resolve));
  }

  /** Plays an audio file (mp3, ogg, wav, ...) to the other side and waits until it has played. Waits for the answer first. */
  async play(file: string): Promise<void> {
    if (!(await this.answered())) throw new Error("The call was not answered.");
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      playIntoCall(this.id, file, finish).catch(reject);
      void this.ended().then(finish);
    });
  }

  /** Stops whatever `play` is sending. */
  stopAudio(): void {
    stopCallAudio(this.id);
  }

  async accept(): Promise<void> {
    await voip().acceptCall(this.id);
  }

  async reject(): Promise<void> {
    await voip().rejectCall(this.id);
  }

  /** On a group call this only takes the bot off; the call goes on for the others. */
  async hangUp(): Promise<void> {
    if (!this.isEnded) await voip().endCall(this.id);
  }

  async mute(muted = true): Promise<void> {
    await voip().setMute(this.id, muted);
  }

  /** @internal Called by the event wiring below. */
  update(info: CallInfo): void {
    this.info = info;
    if (this.isActive) this.answeredWaiters.splice(0).forEach((resolve) => resolve(true));
    if (this.isEnded) {
      this.answeredWaiters.splice(0).forEach((resolve) => resolve(false));
      this.endedWaiters.splice(0).forEach((resolve) => resolve(this.endReason ?? "unknown"));
      tracked.delete(this.id);
    }
  }
}

export type AlertOutcome = "answered" | "declined" | "missed";

// One call at a time, so alerts queue up behind each other.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const tracked = new Map<string, Call>();
const incomingHandlers = new Set<(call: Call) => void | Promise<void>>();

function track(info: CallInfo): Call {
  let call = tracked.get(info.callId);
  if (!call) {
    call = new Call(info);
    tracked.set(info.callId, call);
  }
  call.update(info);
  return call;
}

function toJid(to: string): string {
  return to.includes("@") ? to : phoneToJid(to.replace(/\D/g, ""));
}

export const calls = {
  /** Whether the call packages are installed and loaded. */
  enabled: callsEnabled,

  /** Rings a phone number or JID. Returns at once; use `call.answered()` to wait. */
  async start(to: string): Promise<Call> {
    const api = voip();
    const callId = await api.startCall({ peerJid: toJid(to) });
    const info = api.getCall(callId);
    if (!info) throw new Error("The call could not be started.");
    return track(info);
  },

  /**
   * Starts a call in a group and rings `members` (JIDs, without the bot). The bot stays on, silent,
   * until everyone else has left; WhatsApp then ends the call.
   */
  async startGroup(groupJid: string, members: string[]): Promise<Call> {
    const api = voip();
    if (members.length === 0) throw new Error("Nobody to call in this group.");
    const callId = await api.startCall({ groupJid, participants: members.map((jid) => ({ jid })) });
    const info = api.getCall(callId);
    if (!info) throw new Error("The call could not be started.");
    return track({ ...info, groupJid: info.groupJid ?? groupJid });
  },

  /** The running call of a group, if the bot is on one. */
  inGroup(groupJid: string): Call | undefined {
    return [...tracked.values()].find((call) => call.group === groupJid && !call.isEnded);
  },

  /** Rings, plays a file once answered, then hangs up. Never throws for "no answer". */
  async ring(to: string, file: string, options: { timeoutMs?: number } = {}): Promise<{ answered: boolean; reason: CallEndReason; seconds?: number }> {
    const call = await calls.start(to);
    const answered = await call.answered(options.timeoutMs);
    if (answered) await call.play(file);
    await call.hangUp().catch(() => {});
    const reason = await call.ended();
    return { answered, reason, seconds: call.duration };
  },

  /**
   * Rings until the other side answers or declines, up to `attempts` times, and hangs up as soon
   * as they answer. Calls run one at a time; a second alert waits for the first.
   */
  alert(to: string, options: { attempts?: number; ringMs?: number; pauseMs?: number } = {}): Promise<AlertOutcome> {
    const { attempts = 3, ringMs = 40_000, pauseMs = 8_000 } = options;
    return serialized(async () => {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const call = await calls.start(to);
        const answered = await call.answered(ringMs);
        if (answered) {
          await call.hangUp().catch(() => {});
          return "answered";
        }
        // Nobody picked up in time: stop this ring before the next one.
        await call.hangUp().catch(() => {});
        const reason = await Promise.race([call.ended(), Bun.sleep(5_000).then(() => "unknown")]);
        if (reason === "declined" || reason === "busy" || reason === "rejected_elsewhere") return "declined";
        if (attempt < attempts) await Bun.sleep(pauseMs);
      }
      return "missed";
    });
  },

  /** Runs `handler` for every incoming call. Returns a function that removes it. */
  onIncoming(handler: (call: Call) => void | Promise<void>): () => void {
    incomingHandlers.add(handler);
    return () => incomingHandlers.delete(handler);
  },

  /** Calls that are ringing or connected right now. */
  list(): Call[] {
    return [...tracked.values()];
  },

  get(callId: string): Call | undefined {
    return tracked.get(callId);
  },
};

/** Connects call events of a new client to the helpers above. Called from src/bot/connection.ts. */
export function attachCallEvents(wa: unknown): void {
  if (!callsEnabled()) return;
  const client = wa as { on(event: string, listener: (info: CallInfo) => void): void };
  client.on("voip_call_state", (info) => track(info));
  client.on("voip_call_ended", (info) => track(info));
  client.on("voip_call_incoming", (info) => {
    const call = track(info);
    for (const handler of incomingHandlers) {
      Promise.resolve(handler(call)).catch((error) => logger.warn(`Incoming call handler failed: ${errorMessage(error)}`));
    }
  });
}

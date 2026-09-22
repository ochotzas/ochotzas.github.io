import { joinRoom } from "trystero/nostr";
import type { HostMessage, PadMessage } from "./protocol";

type Wire = { [key: string]: string | number | boolean | null | Wire | Wire[] };

export interface Transport {
  send(peerId: string | null, data: HostMessage | PadMessage): void;
  onMessage(fn: (data: PadMessage | HostMessage, peerId: string) => void): void;
  onJoin(fn: (peerId: string) => void): void;
  onLeave(fn: (peerId: string) => void): void;
  close(): void;
}

const APP_ID = "ochotzas-arcade";

const trystero = (room: string): Transport => {
  const handle = joinRoom({ appId: APP_ID }, room);
  const listeners: ((data: PadMessage | HostMessage, peerId: string) => void)[] = [];
  const action = handle.makeAction<Wire>("msg", {
    onMessage: (data, context) => listeners.forEach((fn) => fn(data as PadMessage, context.peerId)),
  });

  return {
    send: (peerId, data) => void action.send(data as Wire, peerId ? { target: peerId } : undefined),
    onMessage: (fn) => void listeners.push(fn),
    onJoin: (fn) => void (handle.onPeerJoin = fn),
    onLeave: (fn) => void (handle.onPeerLeave = fn),
    close: () => void handle.leave(),
  };
};

const local = (room: string): Transport => {
  const id = Math.random().toString(36).slice(2, 10);
  const channel = new BroadcastChannel(`${APP_ID}:${room}`);
  const joins: ((peerId: string) => void)[] = [];
  const leaves: ((peerId: string) => void)[] = [];
  const messages: ((data: PadMessage | HostMessage, peerId: string) => void)[] = [];
  const seen = new Set<string>();

  channel.onmessage = (event) => {
    const { from, to, kind, data } = event.data ?? {};
    if (from === id || (to && to !== id)) return;
    if (kind === "hello") {
      channel.postMessage({ from: id, to: from, kind: "hi" });
      if (!seen.has(from)) {
        seen.add(from);
        joins.forEach((fn) => fn(from));
      }
      return;
    }
    if (kind === "hi") {
      if (!seen.has(from)) {
        seen.add(from);
        joins.forEach((fn) => fn(from));
      }
      return;
    }
    if (kind === "bye") {
      seen.delete(from);
      leaves.forEach((fn) => fn(from));
      return;
    }
    messages.forEach((fn) => fn(data, from));
  };

  channel.postMessage({ from: id, kind: "hello" });
  window.addEventListener("pagehide", () => channel.postMessage({ from: id, kind: "bye" }));

  return {
    send: (peerId, data) => channel.postMessage({ from: id, to: peerId, kind: "msg", data }),
    onMessage: (fn) => void messages.push(fn),
    onJoin: (fn) => {
      joins.push(fn);
      seen.forEach((peer) => fn(peer));
    },
    onLeave: (fn) => void leaves.push(fn),
    close: () => {
      channel.postMessage({ from: id, kind: "bye" });
      channel.close();
    },
  };
};

export const connect = (room: string): Transport =>
  new URLSearchParams(location.search).has("local") ? local(room) : trystero(room);

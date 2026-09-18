import type { ControlKey, HostMessage, PadLayout } from "./protocol";
import { isMuted, setMuted, sfx, unlock } from "./sound";
import { connect, type Transport } from "./transport";

const DEFAULT_LAYOUT: PadLayout = { dpad: false, buttons: [], hint: "Waiting for the screen" };
const GLYPH = { up: "▲", down: "▼", left: "◀", right: "▶" } as const;

export const startPad = (root: HTMLElement) => {
  const pick = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-${name}]`)!;
  const stage = pick("stage");
  const status = pick("status");
  const screen = pick("screen");
  const hint = pick("pad-hint");
  const note = pick("note");
  const searchHint = pick("hint");
  const form = pick<HTMLFormElement>("join");
  const input = form.querySelector<HTMLInputElement>("input")!;
  const rename = pick<HTMLFormElement>("rename");
  const renameInput = rename.querySelector<HTMLInputElement>("input")!;
  const back = pick<HTMLButtonElement>("back-btn");
  const settingsButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-settings]")];
  const done = pick<HTMLButtonElement>("settings-done");
  const me = pick("me");
  const card = pick("card");
  const cardJob = pick("card-job");
  const cardBlurb = pick("card-blurb");
  const cardAbility = pick("card-ability");
  const cardSecrets = pick("card-secrets");

  const params = new URLSearchParams(location.search);
  const room = (params.get("room") ?? "").toUpperCase();
  root.querySelectorAll<HTMLElement>("[data-room]").forEach((el) => (el.textContent = room));

  let net: Transport | null = null;
  let host: string | null = null;
  let name = "";
  let named = false;
  let layout = DEFAULT_LAYOUT;
  const held = new Set<ControlKey>();

  const view = (next: "name" | "searching" | "settings" | "ready") => (root.dataset.view = next);

  const stopHere = (message: string, detail = "") => {
    view("searching");
    status.textContent = message;
    searchHint.textContent = detail;
    root.querySelector(".radar")?.remove();
  };

  if (!room) return stopHere("No room code in this link");
  if (!window.isSecureContext)
    return stopHere(
      "Needs HTTPS",
      "A phone cannot open a peer connection from a plain http:// address. Use the live site, or npm run dev:https.",
    );
  if (typeof RTCPeerConnection !== "function") return stopHere("No WebRTC in this browser");

  const send = (data: Parameters<Transport["send"]>[1]) => {
    if (host) net?.send(host, data);
  };

  const settle = () => {
    if (!named) {
      view("name");
      return;
    }
    view(host ? "ready" : "searching");
  };

  const applyName = (entered: string) => {
    const clean = entered.trim().slice(0, 12);
    if (!clean) return false;
    name = clean;
    named = true;
    me.textContent = name;
    sessionStorage.setItem("pad-name", name);
    localStorage.setItem("pad-name", name);
    send({ t: "join", name });
    return true;
  };

  const press = (key: ControlKey, down: boolean) => {
    if (down === held.has(key)) return;
    if (down) held.add(key);
    else held.delete(key);
    send({ t: "input", k: key, d: down });
    if (down) {
      navigator.vibrate?.(12);
      if (key === "a" || key === "b") sfx.press();
      else sfx.move();
    }
    stage.querySelector(`[data-key="${key}"]`)?.classList.toggle("down", down);
  };

  const bind = (element: HTMLElement, key: ControlKey) => {
    element.dataset.key = key;
    const down = (event: PointerEvent) => {
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      press(key, true);
    };
    const up = (event: PointerEvent) => {
      event.preventDefault();
      press(key, false);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("pointerleave", up);
  };

  const render = () => {
    stage.innerHTML = "";
    hint.textContent = layout.hint;
    back.hidden = !layout.back;

    if (layout.card) {
      card.hidden = false;
      cardJob.textContent = layout.card.job;
      cardBlurb.textContent = layout.card.blurb;
      cardAbility.textContent = layout.card.ready
        ? `Ability ready · ${layout.card.ability}`
        : `Ability spent · ${layout.card.ability}`;
      cardSecrets.innerHTML = layout.card.secrets.map((line) => `<li>${line}</li>`).join("");
    } else {
      card.hidden = true;
    }

    if (layout.choices?.length) {
      const list = document.createElement("div");
      list.className = "choices";
      layout.choices.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `choice${choice.danger ? " danger" : ""}`;
        button.disabled = Boolean(choice.locked);
        button.innerHTML = `<span class="label">${choice.label}</span>${choice.note ? `<span class="note">${choice.note}</span>` : ""}`;
        button.addEventListener("click", () => {
          if (button.disabled) return;
          list.querySelectorAll(".choice").forEach((other) => other.classList.remove("picked"));
          button.classList.add("picked");
          send({ t: "choice", id: choice.id });
          navigator.vibrate?.(14);
          sfx.press();
        });
        list.append(button);
      });
      stage.append(list);
      return;
    }

    if (layout.dpad) {
      const pad = document.createElement("div");
      pad.className = "dpad";
      (["up", "left", "right", "down"] as const).forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `pad-key pad-${key}`;
        button.setAttribute("aria-label", key);
        button.innerHTML = `<span aria-hidden="true">${GLYPH[key]}</span>`;
        bind(button, key);
        pad.append(button);
      });
      stage.append(pad);
    }

    if (layout.buttons.length) {
      const row = document.createElement("div");
      row.className = "actions";
      layout.buttons.forEach((button) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "action";
        element.textContent = button.label;
        bind(element, button.key);
        row.append(element);
      });
      stage.append(row);
    }
  };

  const keepAwake = async () => {
    try {
      await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request(
        "screen",
      );
    } catch {
      /* not fatal */
    }
  };

  const activeTheme = () => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const themeButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-theme-set]")];
  const paintTheme = () => {
    const now = activeTheme();
    themeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeSet === now)));
  };

  themeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const next = button.dataset.themeSet === "dark" ? "dark" : "light";
      const html = document.documentElement;
      html.classList.add("theme-switching");
      html.dataset.theme = next;
      localStorage.setItem("theme", next);
      document
        .querySelector('meta[name="theme-color"]:not([media])')
        ?.setAttribute("content", next === "dark" ? "#000000" : "#f2f2f4");
      window.setTimeout(() => html.classList.remove("theme-switching"), 360);
      paintTheme();
      navigator.vibrate?.(10);
      sfx.move();
    }),
  );

  const soundButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-sound-set]")];
  const paintSound = () =>
    soundButtons.forEach((button) =>
      button.setAttribute("aria-pressed", String((button.dataset.soundSet === "on") !== isMuted())),
    );

  soundButtons.forEach((button) =>
    button.addEventListener("click", () => {
      setMuted(button.dataset.soundSet !== "on");
      paintSound();
      sfx.press();
      navigator.vibrate?.(10);
    }),
  );

  const captainOnly = pick("captain-only");
  root.querySelectorAll<HTMLButtonElement>("[data-screen-theme]").forEach((button) =>
    button.addEventListener("click", () => {
      const next = button.dataset.screenTheme === "dark" ? "dark" : "light";
      send({ t: "prefs", theme: next });
      root
        .querySelectorAll<HTMLButtonElement>("[data-screen-theme]")
        .forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      navigator.vibrate?.(10);
      sfx.move();
    }),
  );

  paintTheme();
  paintSound();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    unlock();
    if (!applyName(input.value)) return;
    sfx.select();
    void keepAwake();
    settle();
  });

  settingsButtons.forEach((button) =>
    button.addEventListener("click", () => {
      renameInput.value = name || input.value;
      paintTheme();
      paintSound();
      sfx.move();
      view("settings");
    }),
  );

  done.addEventListener("click", () => {
    sfx.select();
    settle();
  });

  rename.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!applyName(renameInput.value)) return;
    sfx.select();
    navigator.vibrate?.(12);
    settle();
  });

  back.addEventListener("click", () => {
    sfx.back();
    send({ t: "input", k: "back", d: true });
    send({ t: "input", k: "back", d: false });
    navigator.vibrate?.(15);
  });

  input.value = sessionStorage.getItem("pad-name") ?? localStorage.getItem("pad-name") ?? "";
  note.textContent = "";

  try {
    net = connect(room);
  } catch (error) {
    return stopHere("Could not start", String(error));
  }

  const lonely = window.setTimeout(() => {
    if (host) return;
    status.textContent = "No screen yet";
    searchHint.textContent = `Nothing is hosting room ${room}. Open /play on the big screen and check the code matches.`;
  }, 9000);

  net.onLeave((peerId) => {
    if (peerId !== host) return;
    host = null;
    status.textContent = "Lost the screen…";
    searchHint.textContent = "";
    if (named) view("searching");
  });

  net.onMessage((data, peerId) => {
    const message = data as HostMessage;

    if (message.t === "welcome") {
      window.clearTimeout(lonely);
      host = peerId;
      status.textContent = "Found it";
      if (named) send({ t: "join", name });
      settle();
    }

    if (message.t === "welcome" || message.t === "layout") {
      layout = message.layout;
      captainOnly.hidden = !layout.captain;
      screen.textContent = message.screen === "lobby" ? "Lobby" : message.screen;
      render();
      return;
    }

    if (message.t === "buzz") navigator.vibrate?.(message.ms);
    if (message.t === "full") stopHere("That room is full");
  });

  addEventListener("pagehide", () => {
    send({ t: "leave" });
    net?.close();
  });

  render();
};

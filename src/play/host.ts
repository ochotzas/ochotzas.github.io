import QRCode from "qrcode";
import { games } from "./games";
import type { Game } from "./games";
import { MAX_PLAYERS, roomCode, type ControlKey, type PadLayout, type PadMessage, type Player } from "./protocol";
import { isMuted, setMuted, sfx, unlock } from "./sound";
import { createFx } from "./stage/fx";
import { createOverlay } from "./stage/overlay";
import { createPost, type Post } from "./stage/post";
import { connect, type Transport } from "./transport";

const CAPTAIN_LOBBY: PadLayout = {
  dpad: true,
  buttons: [{ key: "a", label: "START" }],
  hint: "Captain: swipe left and right through the shelf, START to play.",
};

const CREW_LOBBY: PadLayout = {
  dpad: false,
  buttons: [],
  hint: "The captain is choosing. Heckle accordingly.",
};

const GATE_CAPTAIN: PadLayout = {
  dpad: false,
  buttons: [{ key: "a", label: "ENTER" }],
  hint: "Everyone in? Hit ENTER to open the shelf.",
};

const GATE_CREW: PadLayout = {
  dpad: false,
  buttons: [],
  hint: "Waiting for the captain to start.",
};

const RESULTS_CAPTAIN: PadLayout = {
  dpad: false,
  buttons: [{ key: "a", label: "NEXT" }],
  hint: "Hit NEXT for the shelf.",
};

const RESULTS_CREW: PadLayout = {
  dpad: false,
  buttons: [],
  hint: "Round over. Captain picks the next one.",
};

const WAITING: PadLayout = {
  dpad: false,
  buttons: [],
  hint: "A round is running. You are in the next one.",
};

const SESSION = "arcade-session";

type Saved = { room: string; scores: Record<string, number> };

const readSession = (): Saved | null => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION) ?? "null");
  } catch {
    return null;
  }
};

export const startHost = (root: HTMLElement) => {
  const pick = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-${name}]`)!;
  const canvas = pick<HTMLCanvasElement>("canvas");
  const gate = pick("gate");
  const shell = pick("shell");
  const board = pick("board");
  const rail = pick("rail");
  const roster = pick("roster");
  const gateRoster = pick("gate-roster");
  const toast = pick("toast");
  let toastTimer = 0;
  const titleEl = pick("title");
  const blurbEl = pick("blurb");
  const countEl = pick("count");
  const controlsEl = pick("controls");
  const hud = pick("hud");
  const results = pick("results");
  const resultTitle = pick("result-title");
  const scoreboard = pick("scoreboard");
  const reset = pick<HTMLButtonElement>("reset");
  const enter = pick<HTMLButtonElement>("enter");
  const prefs = pick("prefs");
  const c = canvas.getContext("2d")!;
  const fx = createFx();
  const ui = createOverlay(pick("stage"));
  let post: Post | null = null;

  const isDark = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

  const params = new URLSearchParams(location.search);
  const local = params.has("local");
  const saved = readSession();
  const room = (params.get("room") ?? saved?.room ?? roomCode()).toUpperCase();
  const scores: Record<string, number> = saved?.room === room ? (saved.scores ?? {}) : {};
  const padUrl = `${location.origin}/play/pad?room=${room}${local ? "&local=1" : ""}`;

  const remember = () => sessionStorage.setItem(SESSION, JSON.stringify({ room, scores }));
  remember();

  root.querySelectorAll<HTMLElement>("[data-code]").forEach((el) => (el.textContent = room));
  root.querySelectorAll<HTMLElement>("[data-link]").forEach((el) => (el.textContent = padUrl.replace(/^https?:\/\//, "")));
  const style = getComputedStyle(document.documentElement);
  const plates = root.querySelectorAll<HTMLElement>("[data-qr]");
  QRCode.toString(padUrl, {
    type: "svg",
    margin: 0,
    color: {
      dark: style.getPropertyValue("--qr-ink").trim() || "#000000",
      light: style.getPropertyValue("--qr-plate").trim() || "#ffffff",
    },
  })
    .then((svg) =>
      plates.forEach((el) => {
        el.innerHTML = svg;
        el.dataset.ready = "";
      }),
    )
    .catch(() => plates.forEach((el) => (el.dataset.failed = "")));

  const players = new Map<string, Player>();
  let net: Transport | null = null;
  let game: Game | null = null;
  let running = false;
  let raf = 0;
  let last = 0;
  let cursor = 0;
  let roundIds = new Set<string>();

  const ordered = () => [...players.values()].filter((p) => p.connected).sort((a, b) => a.slot - b.slot);
  const captain = () => ordered()[0] ?? null;
  const send = (id: string | null, data: Parameters<Transport["send"]>[1]) => net?.send(id, data);

  const playable = (def: Game) => {
    const n = ordered().length;
    return n >= def.min && n <= def.max;
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    post?.resize();
  };

  const setTheme = (next: "light" | "dark") => {
    const html = document.documentElement;
    post?.theme(next === "dark");
    html.classList.add("theme-switching");
    html.dataset.theme = next;
    localStorage.setItem("theme", next);
    window.setTimeout(() => html.classList.remove("theme-switching"), 360);
    paintPrefs();
  };

  const activeTheme = () =>
    localStorage.getItem("theme") === "dark" ||
    (!localStorage.getItem("theme") && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";

  function paintPrefs() {
    root
      .querySelectorAll<HTMLButtonElement>("[data-theme-set]")
      .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeSet === activeTheme())));
    root
      .querySelectorAll<HTMLButtonElement>("[data-sound-set]")
      .forEach((button) => button.setAttribute("aria-pressed", String((button.dataset.soundSet === "on") !== isMuted())));
  }

  const notify = (message: string) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => (toast.dataset.show = ""));
    toastTimer = window.setTimeout(() => {
      delete toast.dataset.show;
      window.setTimeout(() => (toast.hidden = true), 300);
    }, 3200);
  };

  const atGate = () => !gate.hidden;
  const atResults = () => !results.hidden;
  let resultsTimer = 0;

  const pushLayouts = (screen: string, layout?: PadLayout) => {
    const lead = captain();
    ordered().forEach((p) => {
      const playing = !layout || roundIds.has(p.id);
      const lobby = atResults()
        ? p.id === lead?.id
          ? RESULTS_CAPTAIN
          : RESULTS_CREW
        : atGate()
        ? p.id === lead?.id
          ? GATE_CAPTAIN
          : GATE_CREW
        : p.id === lead?.id
          ? CAPTAIN_LOBBY
          : CREW_LOBBY;
      const mine = layout ? (playing ? layout : WAITING) : lobby;
      send(p.id, {
        t: "layout",
        layout: { ...mine, back: p.id === lead?.id && Boolean(layout), captain: p.id === lead?.id },
        screen,
      });
    });
  };

  const renderRoster = () => {
    const list = ordered();
    const lead = captain();

    const seats = list
      .map(
        (p, i) => `
        <li class="seat filled${p.id === lead?.id ? " lead" : ""}">
          <span class="seat-no">P${i + 1}</span>
          <span class="seat-name">${p.name}</span>
          <span class="seat-score">${p.score}</span>
        </li>`,
      )
      .join("");

    roster.innerHTML = seats || `<li class="seat"><span class="seat-name">no phones</span></li>`;
    hud.innerHTML = seats;

    const slots = list
      .map(
        (p, i) => `
        <li class="seat filled">
          <span class="seat-no">P${i + 1}</span>
          <span class="seat-name">${p.name}</span>
          ${p.id === lead?.id ? '<span class="seat-tag">captain</span>' : ""}
        </li>`,
      )
      .join("");

    const waiting =
      list.length < MAX_PLAYERS
        ? `<li class="seat"><span class="seat-no">P${list.length + 1}</span><span class="seat-name">waiting…</span></li>`
        : "";

    gateRoster.innerHTML = slots + waiting;
    enter.disabled = list.length === 0;
    enter.textContent = list.length ? "Enter" : "Waiting for a phone";
    if (atGate() && !game) pushLayouts("lobby");
  };

  const renderPicker = () => {
    if (!games.length) {
      titleEl.textContent = "Games coming soon";
      blurbEl.textContent = "The room works — the shelf is empty. Something will be here shortly.";
      countEl.textContent = "nothing to play yet";
      controlsEl.innerHTML = "";
      return;
    }

    const tiles = [...rail.querySelectorAll<HTMLElement>("[data-game]")];
    tiles.forEach((tile, index) => {
      tile.classList.toggle("on", index === cursor);
      tile.classList.toggle("off", !playable(games[index]));
    });

    const def = games[cursor];
    const n = ordered().length;
    titleEl.textContent = def.name;
    blurbEl.textContent = def.blurb;
    countEl.textContent = playable(def)
      ? def.min === def.max
        ? `${def.min} players`
        : `${def.min}–${def.max} players`
      : n < def.min
        ? `needs ${def.min} phones`
        : `too many phones, max ${def.max}`;

    const layout = def.layout;
    const dpad = layout.dpad
      ? `<span class="pad-mini" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="pad-label">move</span>`
      : "";
    const buttons = layout.buttons
      .map((b) => `<span class="btn-mini">${b.label}</span>`)
      .join("");
    controlsEl.innerHTML = `${dpad}${buttons}<span class="pad-hint">${layout.hint}</span>`;

    const focused = tiles[cursor];
    const shelf = rail.parentElement;
    if (focused && shelf) {
      const offset = shelf.clientWidth / 2 - (focused.offsetLeft + focused.offsetWidth / 2);
      rail.style.setProperty("--shift", `${offset}px`);
    }
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    game = null;
    running = false;
    fx.clear();
    ui.clear();
    post?.show(false);
  };

  const toLobby = (message?: string) => {
    stop();
    window.clearTimeout(resultsTimer);
    roundIds = new Set();
    board.hidden = true;
    results.hidden = true;
    if (gate.hidden) shell.hidden = false;
    if (message) notify(message);
    renderRoster();
    renderPicker();
    pushLayouts(atGate() ? "lobby" : "shelf");
  };

  const showResults = (summary: string, points: Record<string, number>) => {
    stop();
    roundIds = new Set();
    board.hidden = true;
    shell.hidden = true;
    results.hidden = false;
    resultTitle.textContent = summary;
    sfx.win();

    const ranked = ordered().sort((a, b) => b.score - a.score);
    const best = ranked[0]?.score ?? 0;
    scoreboard.innerHTML = ranked
      .map((p, i) => {
        const gained = points[p.id] ?? 0;
        return `
        <li class="score${p.score === best && best > 0 ? " top" : ""}">
          <span class="rank">${i + 1}</span>
          <span class="name">${p.name}</span>
          <span class="gain">${gained > 0 ? `+${gained}` : "—"}</span>
          <span class="total">${p.score}</span>
        </li>`;
      })
      .join("");

    renderRoster();
    pushLayouts("results");
    resultsTimer = window.setTimeout(() => toLobby(), 15000);
  };

  const refuse = (def: Game, who?: string) => {
    const n = ordered().length;
    notify(
      n < def.min
        ? `${def.name} needs ${def.min} phones, you have ${n}`
        : `${def.name} tops out at ${def.max} phones, you have ${n}`,
    );
    sfx.refuse();
    if (who) send(who, { t: "buzz", ms: 220 });
  };

  const play = (def: Game | undefined, who?: string) => {
    if (!def) return;
    if (!playable(def)) {
      refuse(def, who);
      return;
    }
    const list = ordered();

    shell.hidden = true;
    board.hidden = false;
    requestAnimationFrame(resize);
    resize();
    post?.theme(isDark());
    post?.show(true);

    sfx.start();
    game = def;
    roundIds = new Set(list.map((p) => p.id));
    pushLayouts(def.name, def.layout);
    fx.clear();
    ui.clear();
    def.start({
      players: list,
      width: canvas.width,
      height: canvas.height,
      fx,
      ui,
      buzz: (id, ms) => send(id, { t: "buzz", ms }),
      pad: (id, custom) =>
        send(id, {
          t: "layout",
          layout: { ...custom, back: captain()?.id === id, captain: captain()?.id === id },
          screen: def.name,
        }),
      finish: (points, summary) => {
        Object.entries(points).forEach(([id, value]) => {
          const player = players.get(id);
          if (!player) return;
          player.score += value;
          scores[player.name] = player.score;
        });
        remember();
        showResults(summary, points);
      },
    });

    const opening = def;
    running = false;
    last = performance.now();

    const loop = (now: number) => {
      if (!game) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (running) game.tick(dt);
      if (!game) return;
      fx.update(dt);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.save();
      fx.apply(c);
      game.draw(c);
      c.restore();
      fx.draw(c);
      post?.present();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    void (async () => {
      await ui.card({ kicker: `${list.length} players`, title: def.name, sub: def.blurb, hold: 1500 });
      if (game !== opening) return;
      await ui.countdown(3);
      if (game !== opening) return;
      running = true;
    })();
  };

  const move = (delta: number) => {
    if (!games.length) return;
    cursor = (cursor + delta + games.length) % games.length;
    renderPicker();
    sfx.move();
  };

  rail.innerHTML = !games.length
    ? `<li class="soon">Games coming soon</li>`
    : games
    .map(
      (g, i) => `
      <li class="tile${i === 0 ? " on" : ""}" data-game="${g.id}">
        <button type="button">
          <canvas class="art" width="440" height="280"></canvas>
          <span class="name">${g.name}</span>
        </button>
      </li>`,
    )
    .join("");

  const arts = [...rail.querySelectorAll<HTMLCanvasElement>(".art")].map((el) => el.getContext("2d")!);
  const hasGames = games.length > 0;
  const paintTiles = (now: number) => {
    if (!hasGames) return;
    if (!game) {
      arts.forEach((art, i) => {
        art.clearRect(0, 0, art.canvas.width, art.canvas.height);
        games[i].preview?.(art, now / 1000);
      });
    }
    requestAnimationFrame(paintTiles);
  };
  requestAnimationFrame(paintTiles);

  if (new URLSearchParams(location.search).get("post") !== "0")
    void createPost(canvas, board).then((made) => {
      post = made;
      if (made.ready && game) {
        made.theme(isDark());
        made.show(true);
      }
    });

  rail.addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-game]");
    if (!tile) return;
    const index = games.findIndex((g) => g.id === tile.dataset.game);
    if (index === cursor) play(games[cursor]);
    else {
      cursor = index;
      renderPicker();
    }
  });

  const enterConsole = (gesture: boolean) => {
    if (!gate.hidden && ordered().length === 0) return;
    unlock();
    sfx.select();
    gate.hidden = true;
    shell.hidden = false;
    if (gesture) void root.requestFullscreen?.().catch(() => undefined);
    renderPicker();
    pushLayouts("shelf");
  };

  enter.addEventListener("click", () => {
    if (!enter.disabled) enterConsole(true);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-theme-set]").forEach((button) =>
    button.addEventListener("click", () => {
      setTheme(button.dataset.themeSet === "dark" ? "dark" : "light");
      sfx.move();
    }),
  );

  root.querySelectorAll<HTMLButtonElement>("[data-sound-set]").forEach((button) =>
    button.addEventListener("click", () => {
      setMuted(button.dataset.soundSet !== "on");
      paintPrefs();
      sfx.press();
    }),
  );

  root.querySelectorAll<HTMLButtonElement>("[data-prefs-open]").forEach((button) =>
    button.addEventListener("click", () => {
      unlock();
      paintPrefs();
      prefs.hidden = false;
      sfx.move();
    }),
  );

  root.querySelectorAll<HTMLButtonElement>("[data-prefs-close]").forEach((button) =>
    button.addEventListener("click", () => {
      prefs.hidden = true;
      sfx.select();
    }),
  );

  paintPrefs();

  reset.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION);
    location.href = `/play${local ? "?local=1" : ""}`;
  });

  net = connect(room);

  net.onJoin((peerId) => {
    send(peerId, { t: "welcome", slot: -1, layout: GATE_CREW, screen: atGate() ? "lobby" : "shelf" });
  });

  net.onLeave((peerId) => {
    const player = players.get(peerId);
    if (!player) return;
    player.connected = false;
    if (game) toLobby(`${player.name} wandered off`);
    else toLobby();
  });

  net.onMessage((data, peerId) => {
    const message = data as PadMessage;

    if (message.t === "prefs") {
      if (captain()?.id === peerId) setTheme(message.theme);
      return;
    }

    if (message.t === "join") {
      const existing = players.get(peerId);
      if (!existing && players.size >= MAX_PLAYERS) {
        send(peerId, { t: "full" });
        return;
      }
      const chosen = message.name.slice(0, 12) || `Player ${players.size + 1}`;
      if (existing) {
        existing.name = chosen;
        existing.connected = true;
      } else {
        players.set(peerId, {
          id: peerId,
          name: chosen,
          slot: players.size,
          score: scores[chosen] ?? 0,
          connected: true,
        });
        sfx.join();
      }
      const player = players.get(peerId)!;
      player.score = scores[player.name] ?? player.score;
      renderRoster();
      renderPicker();
      pushLayouts(game ? game.name : atGate() ? "lobby" : "shelf", game?.layout);
      return;
    }

    const player = players.get(peerId);
    if (!player) return;



    if (message.t === "leave") {
      player.connected = false;
      renderRoster();
      return;
    }

    if (message.t === "choice") {
      if (game && roundIds.has(peerId)) game.choice?.(peerId, message.id);
      return;
    }

    if (message.t !== "input") return;
    const isCaptain = captain()?.id === peerId;

    if (message.k === "back") {
      if (message.d && isCaptain && (game || atResults())) toLobby(game ? "Back to the menu" : undefined);
      return;
    }

    if (!game && atResults()) {
      if (isCaptain && message.d && message.k === "a") toLobby();
      return;
    }

    if (!game) {
      if (!isCaptain || !message.d) return;
      if (atGate()) {
        if (message.k === "a") enterConsole(false);
        return;
      }
      if (message.k === "up" || message.k === "left") move(-1);
      if (message.k === "down" || message.k === "right") move(1);
      if (message.k === "a") play(games[cursor], peerId);
      return;
    }

    if (roundIds.has(peerId)) game.input(peerId, message.k as ControlKey, message.d);
  });

  addEventListener("resize", resize);
  addEventListener("pagehide", () => net?.close());
  document.addEventListener("keydown", (event) => {
    if (!prefs.hidden && event.key === "Escape") {
      prefs.hidden = true;
      return;
    }
    if (atResults() && (event.key === "Enter" || event.key === "Escape")) {
      toLobby();
      return;
    }
    if (event.key === "Escape" && game) toLobby("Stopped");
    if (!game && (event.key === "ArrowLeft" || event.key === "ArrowRight")) move(event.key === "ArrowLeft" ? -1 : 1);
    if (!game && event.key === "Enter") play(games[cursor]);
  });

  toLobby();
};

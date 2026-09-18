export interface CardOptions {
  kicker?: string;
  title: string;
  sub?: string;
  hold?: number;
}

export interface Overlay {
  card(options: CardOptions): Promise<void>;
  countdown(from?: number): Promise<void>;
  banner(text: string, ms?: number): void;
  timer(seconds: number | null): void;
  note(text: string | null): void;
  clear(): void;
}

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));

export const createOverlay = (root: HTMLElement): Overlay => {
  let bannerTimer = 0;
  let token = 0;

  const make = (className: string) => {
    const el = document.createElement("div");
    el.className = className;
    return el;
  };

  const span = (className: string, value: string) => {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = value;
    return el;
  };

  const timerEl = make("stage-timer");
  const noteEl = make("stage-note");
  const bannerEl = make("stage-banner");
  root.append(timerEl, noteEl, bannerEl);

  const show = async (el: HTMLElement, hold: number) => {
    root.append(el);
    await frame();
    el.dataset.on = "";
    await wait(hold);
    delete el.dataset.on;
    await wait(260);
    el.remove();
  };

  return {
    async card({ kicker, title, sub, hold = 1400 }) {
      const mine = (token += 1);
      const el = make("stage-card");
      if (kicker) el.append(span("kicker", kicker));
      el.append(span("title", title));
      if (sub) el.append(span("sub", sub));
      await show(el, hold);
      if (mine !== token) return;
    },

    async countdown(from = 3) {
      const mine = (token += 1);
      for (let n = from; n > 0; n -= 1) {
        if (mine !== token) return;
        const el = make("stage-count");
        el.append(span("n", String(n)));
        root.append(el);
        await frame();
        el.dataset.on = "";
        await wait(560);
        el.remove();
      }
      if (mine !== token) return;
      const go = make("stage-count go");
      go.append(span("n", "GO"));
      root.append(go);
      await frame();
      go.dataset.on = "";
      await wait(420);
      go.remove();
    },

    banner(text, ms = 1500) {
      window.clearTimeout(bannerTimer);
      bannerEl.textContent = text;
      bannerEl.dataset.on = "";
      bannerTimer = window.setTimeout(() => delete bannerEl.dataset.on, ms);
    },

    timer(seconds) {
      if (seconds === null) {
        delete timerEl.dataset.on;
        return;
      }
      const whole = Math.max(0, Math.ceil(seconds));
      timerEl.textContent = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
      timerEl.dataset.on = "";
      timerEl.classList.toggle("urgent", whole <= 5);
    },

    note(text) {
      if (!text) {
        delete noteEl.dataset.on;
        return;
      }
      noteEl.textContent = text;
      noteEl.dataset.on = "";
    },

    clear() {
      token += 1;
      window.clearTimeout(bannerTimer);
      delete bannerEl.dataset.on;
      delete timerEl.dataset.on;
      delete noteEl.dataset.on;
      root.querySelectorAll(".stage-card, .stage-count").forEach((el) => el.remove());
    },
  };
};

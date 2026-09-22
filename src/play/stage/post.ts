import { AdjustmentFilter, AdvancedBloomFilter, CRTFilter } from "pixi-filters";
import { Application, CanvasSource, Sprite, Texture, type Filter } from "pixi.js";

export interface Post {
  ready: boolean;
  present(): void;
  resize(): void;
  theme(dark: boolean): void;
  show(on: boolean): void;
  destroy(): void;
}

const inert: Post = {
  ready: false,
  present() {},
  resize() {},
  theme() {},
  show() {},
  destroy() {},
};

const readToken = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const canRender = () => {
  if (typeof WebGL2RenderingContext === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
};

export const createPost = async (source: HTMLCanvasElement, mount: HTMLElement): Promise<Post> => {
  if (!canRender()) return inert;

  let app: Application;
  try {
    app = new Application();
    await app.init({
      width: Math.max(1, source.width),
      height: Math.max(1, source.height),
      resolution: 1,
      autoDensity: false,
      antialias: false,
      preference: "webgl",
      backgroundAlpha: 1,
      background: readToken("--canvas", "#f2f2f4"),
    });
  } catch {
    return inert;
  }

  app.ticker.stop();
  app.canvas.className = "post";
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  mount.append(app.canvas);

  const texture = new Texture({ source: new CanvasSource({ resource: source }) });
  const sprite = new Sprite(texture);
  app.stage.addChild(sprite);

  const grain = new CRTFilter({
    curvature: 0,
    lineWidth: 0,
    lineContrast: 0,
    noise: 0.09,
    noiseSize: 1.1,
    vignetting: 0.42,
    vignettingAlpha: 0.5,
    vignettingBlur: 0.55,
    time: 0,
  });

  const lightChain: Filter[] = [
    new AdjustmentFilter({ contrast: 1.08, brightness: 1.01, gamma: 1.02, saturation: 1 }),
    grain,
  ];

  const darkChain: Filter[] = [
    new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.85, brightness: 1, blur: 5, quality: 4 }),
    new AdjustmentFilter({ contrast: 1.05, brightness: 1, gamma: 1, saturation: 1 }),
    grain,
  ];

  let dark = false;
  sprite.filters = lightChain;

  const post: Post = {
    ready: true,

    present() {
      if (!post.ready) return;
      try {
        post.resize();
        grain.time += 0.34;
        texture.source.update();
        app.renderer.render(app.stage);
      } catch {
        post.ready = false;
        post.show(false);
      }
    },

    resize() {
      const w = source.width;
      const h = source.height;
      if (w < 1 || h < 1) return;
      if (app.renderer.width === w && app.renderer.height === h && sprite.width === w) return;
      app.renderer.resize(w, h, 1);
      texture.source.resize(w, h);
      sprite.setSize(w, h);
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
    },

    theme(next) {
      dark = next;
      sprite.filters = dark ? darkChain : lightChain;
      app.renderer.background.color = readToken("--canvas", dark ? "#000000" : "#f2f2f4");
    },

    show(on) {
      const live = on && post.ready;
      app.canvas.hidden = !live;
      source.style.visibility = live ? "hidden" : "visible";
    },

    destroy() {
      app.destroy(true, { children: true });
    },
  };

  post.show(false);
  return post;
};

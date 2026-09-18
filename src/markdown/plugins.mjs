import Slugger from "github-slugger";
import katex from "katex";
import { site } from "../data/site.ts";

export function headingAnchors() {
  const slugger = new Slugger();
  return {
    name: "heading-anchors",
    element: {
      filter: ["h2", "h3", "h4", "h5", "h6"],
      visit(node, ctx) {
        const existing = node.properties?.id;
        const id = typeof existing === "string" ? existing : slugger.slug(ctx.textContent(node));
        ctx.setProperty(node, "id", id);
        ctx.appendChild(node, {
          type: "element",
          tagName: "a",
          properties: { className: ["anchor"], href: `#${id}`, ariaHidden: "true", tabIndex: -1 },
          children: [{ type: "text", value: "#" }],
        });
      },
    },
  };
}

export function externalLinks() {
  const host = new URL(site.url).host;
  return {
    name: "external-links",
    element: {
      filter: ["a"],
      visit(node, ctx) {
        const href = node.properties?.href;
        if (typeof href !== "string" || !/^https?:\/\//.test(href)) return;
        if (new URL(href).host === host) return;
        ctx.setProperty(node, "target", "_blank");
        ctx.setProperty(node, "rel", "noopener noreferrer");
      },
    },
  };
}

const CALLOUTS = { note: "Note", tip: "Tip", warning: "Warning", aside: "Aside" };

export function callouts() {
  return {
    name: "callouts",
    containerDirective(node, ctx) {
      const kind = CALLOUTS[node.name];
      if (!kind) return;
      const first = node.children[0];
      const labelled = first?.type === "paragraph" && first.data?.directiveLabel === true;
      const label = labelled ? ctx.textContent(first) : kind;
      if (labelled) ctx.removeChildAt(node, 0);
      ctx.setProperty(node, "data", {
        hName: "aside",
        hProperties: { className: ["callout", `callout-${node.name}`], "data-label": label },
      });
    },
  };
}

export function math() {
  const render = (value, displayMode) =>
    katex.renderToString(value, {
      displayMode,
      output: "mathml",
      throwOnError: false,
      strict: "ignore",
    });

  return {
    name: "math",
    math(node, ctx) {
      const html = `<div class="scroll-x">${render(node.value, true)}</div>`;
      ctx.replaceNode(node, { raw: html, mdxExpressions: false });
    },
    inlineMath(node, ctx) {
      ctx.replaceNode(node, { raw: render(node.value, false), mdxExpressions: false });
    },
  };
}

export function scrollableTables() {
  return {
    name: "scrollable-tables",
    element: {
      filter: ["table"],
      visit(node, ctx) {
        ctx.wrapNode(node, {
          type: "element",
          tagName: "div",
          properties: { className: ["scroll-x"] },
          children: [],
        });
      },
    },
  };
}

import { site } from "../data/site";

export const absolute = (markdown: string) =>
  markdown.replace(/(\]\(|src=")\/(?!\/)/g, `$1${site.url}/`);

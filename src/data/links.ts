import { linksSchema } from "./schema";

export const links = linksSchema.parse([
  { label: "GitHub", handle: "ochotzas", href: "https://github.com/ochotzas" },
  { label: "LinkedIn", handle: "ochotzas", href: "https://linkedin.com/in/ochotzas" },
  { label: "PyPI", handle: "promptkit-core", href: "https://pypi.org/project/promptkit-core/" },
]);

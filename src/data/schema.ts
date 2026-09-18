import { z } from "astro/zod";

export const profileSchema = z.object({
  name: z.string(),
  role: z.string(),
  locality: z.string(),
  country: z.string(),
  countryCode: z.string().length(2),
  email: z.email(),
  tagline: z.string(),
  bio: z.array(z.string()).min(1),
  available: z.string().nullable(),
});

export const workSchema = z.array(
  z.object({
    name: z.string(),
    blurb: z.string(),
    stack: z.array(z.string()).min(1),
    year: z.number().int().min(2000).max(2100),
    status: z.enum(["active", "archived", "wip"]),
    href: z.url().nullable(),
    repo: z.url().nullable(),
  }),
);

export const stackSchema = z.array(
  z.object({
    group: z.string(),
    items: z.array(z.string()).min(1),
  }),
);

export const linksSchema = z.array(
  z.object({
    label: z.string(),
    handle: z.string(),
    href: z.url(),
  }),
);

export type Profile = z.infer<typeof profileSchema>;
export type Work = z.infer<typeof workSchema>;
export type Stack = z.infer<typeof stackSchema>;
export type Links = z.infer<typeof linksSchema>;

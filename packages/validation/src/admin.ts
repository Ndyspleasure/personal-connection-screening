import { z } from 'zod';

/**
 * Admin CMS request schemas (Technology Architecture §24, §77; Functional §80,
 * §113). Strict objects: unknown fields are rejected, never silently trusted.
 * Content is treated as untrusted text everywhere it is later rendered
 * (Threat TH-046/047) — these schemas only bound shape and length.
 */

const sectionVisibility = z.enum(['PUBLIC', 'HIDDEN']);

export const profileUpdateRequestSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, or hyphens'),
    displayName: z.string().min(1).max(200),
  })
  .strict();
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;

const sectionBodySchema = {
  sectionType: z.string().min(1).max(64),
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(400).nullable().optional(),
  body: z.string().max(8000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10_000).optional(),
  visibility: sectionVisibility.optional(),
};

export const sectionCreateRequestSchema = z.object(sectionBodySchema).strict();
export type SectionCreateRequest = z.infer<typeof sectionCreateRequestSchema>;

export const sectionUpdateRequestSchema = z
  .object({ expectedVersion: z.number().int().nonnegative(), ...sectionBodySchema })
  .strict();
export type SectionUpdateRequest = z.infer<typeof sectionUpdateRequestSchema>;

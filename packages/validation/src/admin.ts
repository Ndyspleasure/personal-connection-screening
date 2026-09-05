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

/* --- Questionnaire builder ------------------------------------------------- */

export const questionType = z.enum([
  'single_choice',
  'multiple_choice',
  'boolean',
  'text',
  'numeric',
]);
export type QuestionType = z.infer<typeof questionType>;

export const questionnaireCreateRequestSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, or hyphens'),
    name: z.string().min(1).max(200),
  })
  .strict();
export type QuestionnaireCreateRequest = z.infer<typeof questionnaireCreateRequestSchema>;

export const questionAddRequestSchema = z
  .object({
    type: questionType,
    text: z.string().min(1).max(2000),
    description: z.string().max(2000).nullable().optional(),
    required: z.boolean().optional(),
    options: z
      .array(z.object({ value: z.string().min(1).max(200), label: z.string().min(1).max(400) }))
      .max(64)
      .optional(),
  })
  .strict();
export type QuestionAddRequest = z.infer<typeof questionAddRequestSchema>;

export const publishWithScoringRequestSchema = z
  .object({
    passingScore: z.number().finite().min(0),
    rules: z
      .array(
        z.object({
          optionVersionId: z.string().uuid(),
          points: z.number().finite(),
        }),
      )
      .min(1)
      .max(512),
  })
  .strict();
export type PublishWithScoringRequest = z.infer<typeof publishWithScoringRequestSchema>;

/* --- Scoring test-evaluation (preview) ------------------------------------- */

export const previewScoreRequestSchema = z
  .object({
    passingScore: z.number().finite().min(0),
    rules: z
      .array(
        z.object({
          optionVersionId: z.string().uuid(),
          points: z.number().finite(),
          weight: z.number().finite().min(0).optional(),
        }),
      )
      .min(1)
      .max(512),
    answers: z
      .array(
        z.object({
          questionVersionId: z.string().uuid(),
          selectedOptionVersionIds: z.array(z.string().uuid()).max(64),
        }),
      )
      .max(256),
  })
  .strict();
export type PreviewScoreRequest = z.infer<typeof previewScoreRequestSchema>;

/* --- Policy manager -------------------------------------------------------- */

export const retakeMode = z.enum([
  'NEVER',
  'ON_NEW_VERSION',
  'AFTER_COOLDOWN',
  'ADMIN_APPROVAL',
  'UNLIMITED',
]);

export const policyDraftRequestSchema = z
  .object({
    sessionLifetimeSeconds: z
      .number()
      .int()
      .min(60)
      .max(60 * 60 * 24 * 30),
    questionnaireTimeLimitSeconds: z
      .number()
      .int()
      .min(0)
      .max(60 * 60 * 24)
      .nullable()
      .optional(),
    allowResume: z.boolean().optional(),
    allowMultiDevice: z.boolean().optional(),
    retakeMode: retakeMode.optional(),
    maxAttempts: z.number().int().min(1).max(100).optional(),
    cooldownSeconds: z
      .number()
      .int()
      .min(0)
      .max(60 * 60 * 24 * 30)
      .optional(),
  })
  .strict();
export type PolicyDraftRequest = z.infer<typeof policyDraftRequestSchema>;

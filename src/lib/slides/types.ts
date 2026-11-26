import { z } from "zod";

/**
 * Slide lesson data, version 2. Stored as JSON in `lessons.content` (no schema change):
 * Bài học → Hoạt động → Slide → Phần tử. Every element is a box whose position and size are
 * percentages of a fixed 16:9 slide (x, y, w, h in 0–100), so a slide scales as one picture.
 */
export const SLIDE_CONTENT_VERSION = 2;
export const SLIDE_KEY_PREFIX = "slides:";
export const MAX_ACTIVITIES = 50;
export const MAX_SLIDES_PER_ACTIVITY = 100;
export const MAX_ELEMENTS_PER_SLIDE = 30;
export const MAX_TEXT_LENGTH = 5000;
export const MAX_IMAGE_SRC_LENGTH = 400_000;
/** Text sizes are stored in px of a 1280px-wide slide and drawn in cqw, so they scale with the slide. */
export const REFERENCE_WIDTH = 1280;

export const ELEMENT_TYPES = ["title", "text", "image", "model3d"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
export const ANIM_MODES = ["enter", "with", "immediate"] as const;
export type AnimMode = (typeof ANIM_MODES)[number];
export const ALIGNS = ["left", "center", "right"] as const;
export type Align = (typeof ALIGNS)[number];

export type Box = { x: number; y: number; w: number; h: number };

const elementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ELEMENT_TYPES),
  x: z.number().min(-20).max(120),
  y: z.number().min(-20).max(120),
  w: z.number().min(0.5).max(150),
  h: z.number().min(0.5).max(150),
  text: z.string().max(MAX_TEXT_LENGTH).default(""),
  fontSize: z.number().min(6).max(300).optional(),
  fit: z.number().min(0.1).max(1).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  align: z.enum(ALIGNS).optional(),
  slot: z.string().max(40).optional(),
  custom: z.boolean().optional(),
  anim: z.enum(ANIM_MODES).default("enter"),
  src: z.string().max(MAX_IMAGE_SRC_LENGTH).optional(),
  alt: z.string().max(200).optional(),
  modelId: z.string().max(60).optional(),
});
const slideSchema = z.object({
  id: z.string().min(1),
  layout: z.string().min(1).default("title-content"),
  elements: z.array(elementSchema).max(MAX_ELEMENTS_PER_SLIDE),
  /** Element ids in the order they appear on Enter; always lists exactly the slide's elements. */
  order: z.array(z.string()).default([]),
});
const activitySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(150),
  slides: z.array(slideSchema).max(MAX_SLIDES_PER_ACTIVITY),
});
export const slideContentSchema = z.object({
  kind: z.literal("slides"),
  version: z.literal(SLIDE_CONTENT_VERSION),
  activities: z.array(activitySchema).max(MAX_ACTIVITIES),
});

export type SlideElement = z.infer<typeof elementSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type SlideContent = z.infer<typeof slideContentSchema>;

export type IdFactory = () => string;
export const randomId: IdFactory = () => crypto.randomUUID();

/** Version 1 (phase 1–2): elements had no boxes; kept only so lessons saved then still open. */
export const slideContentV1Schema = z.object({
  kind: z.literal("slides"),
  version: z.literal(1),
  activities: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().max(150),
        slides: z
          .array(
            z.object({
              id: z.string().min(1),
              layout: z.string().min(1).default("title-content"),
              elements: z
                .array(
                  z.object({
                    id: z.string().min(1),
                    type: z.enum(["title", "text"]),
                    text: z.string().max(MAX_TEXT_LENGTH),
                  }),
                )
                .max(MAX_ELEMENTS_PER_SLIDE),
            }),
          )
          .max(MAX_SLIDES_PER_ACTIVITY),
      }),
    )
    .max(MAX_ACTIVITIES),
});

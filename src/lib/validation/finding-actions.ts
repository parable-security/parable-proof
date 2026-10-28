// Screen 6 (Exception Detail): the Mark Resolved and Add Note forms.
// Pure: no database, no Next.js. Inputs are unknown because FormData.get can
// return a File; anything that isn't a string is treated as empty.
import { z } from "zod";

export type ResolveFindingInput = { resolutionNote: string; resolvedBy: string };
export type ResolveFindingFieldErrors = { resolutionNote?: string[]; resolvedBy?: string[] };
export type FindingNoteFieldErrors = { note?: string[] };

export type ParseResolveFindingResult =
  | { success: true; data: ResolveFindingInput }
  | { success: false; fieldErrors: ResolveFindingFieldErrors };

export type ParseFindingNoteResult =
  | { success: true; data: { note: string } }
  | { success: false; fieldErrors: FindingNoteFieldErrors };

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const resolveFindingSchema = z.object({
  resolutionNote: z
    .string()
    .trim()
    .min(1, "Enter a resolution note.")
    .max(2000, "Resolution note must be 2,000 characters or fewer."),
  resolvedBy: z
    .string()
    .trim()
    .min(1, "Enter who resolved this finding.")
    .max(200, "Resolved by must be 200 characters or fewer."),
});

const findingNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Enter a note.")
    .max(2000, "Note must be 2,000 characters or fewer."),
});

export function parseResolveFindingForm(fields: {
  resolutionNote: unknown;
  resolvedBy: unknown;
}): ParseResolveFindingResult {
  const parsed = resolveFindingSchema.safeParse({
    resolutionNote: asText(fields.resolutionNote),
    resolvedBy: asText(fields.resolvedBy),
  });
  if (!parsed.success) {
    return { success: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  return { success: true, data: parsed.data };
}

export function parseFindingNoteForm(fields: { note: unknown }): ParseFindingNoteResult {
  const parsed = findingNoteSchema.safeParse({ note: asText(fields.note) });
  if (!parsed.success) {
    return { success: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  return { success: true, data: parsed.data };
}

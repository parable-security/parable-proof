"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { addFindingNote, resolveFinding } from "@/lib/data/findings";
import {
  type FindingNoteFieldErrors,
  parseFindingNoteForm,
  parseResolveFindingForm,
  type ResolveFindingFieldErrors,
} from "@/lib/validation/finding-actions";

// Bound arguments (reviewId, findingId) come from the client and are untrusted:
// the data functions re-check them against the signed-in user's company.
// The signed-in account (id and name) comes only from requireRole.

export type ResolveFindingState =
  | {
      fieldErrors?: ResolveFindingFieldErrors;
      formError?: string;
      values: { resolutionNote: string; resolvedBy: string };
    }
  | undefined;

export type FindingNoteState =
  | { fieldErrors?: FindingNoteFieldErrors; formError?: string; values: { note: string } }
  | undefined;

const WRONG_STATUS_MESSAGE = "This review's results aren't ready.";

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function resolveFindingAction(
  reviewId: string,
  findingId: string,
  _prevState: ResolveFindingState,
  formData: FormData,
): Promise<ResolveFindingState> {
  const user = await requireRole("customer_admin");

  const raw = {
    resolutionNote: formData.get("resolutionNote"),
    resolvedBy: formData.get("resolvedBy"),
  };
  const values = { resolutionNote: text(raw.resolutionNote), resolvedBy: text(raw.resolvedBy) };
  const parsed = parseResolveFindingForm(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors, values };
  }

  const result = await resolveFinding(user.companyId, reviewId, findingId, user.userId, parsed.data);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    if (result.error === "FINALIZED") {
      return { formError: "This review is finalized. Findings can't be resolved.", values };
    }
    if (result.error === "WRONG_STATUS") return { formError: WRONG_STATUS_MESSAGE, values };
    return { formError: "This finding is already resolved or can't be resolved.", values };
  }
  refresh();
  return undefined;
}

export async function addFindingNoteAction(
  reviewId: string,
  findingId: string,
  _prevState: FindingNoteState,
  formData: FormData,
): Promise<FindingNoteState> {
  const user = await requireRole("customer_admin");

  const raw = formData.get("note");
  const values = { note: text(raw) };
  const parsed = parseFindingNoteForm({ note: raw });
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors, values };
  }

  const result = await addFindingNote(
    user.companyId,
    reviewId,
    findingId,
    { userId: user.userId, fullName: user.fullName },
    parsed.data.note,
  );
  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    if (result.error === "FINALIZED") {
      return { formError: "This review is finalized. Notes can't be added.", values };
    }
    return { formError: WRONG_STATUS_MESSAGE, values };
  }
  refresh();
  return undefined;
}

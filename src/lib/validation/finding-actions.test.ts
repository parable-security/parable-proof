import { describe, expect, it } from "vitest";

import { parseFindingNoteForm, parseResolveFindingForm } from "./finding-actions";

describe("parseResolveFindingForm", () => {
  const valid = { resolutionNote: "Access removed by IT on October 20.", resolvedBy: "Jane Doe" };

  it("accepts a note and a name", () => {
    expect(parseResolveFindingForm(valid)).toEqual({ success: true, data: valid });
  });

  it("trims both fields", () => {
    expect(
      parseResolveFindingForm({ resolutionNote: "  Removed.\n", resolvedBy: "\tJane Doe " }),
    ).toEqual({ success: true, data: { resolutionNote: "Removed.", resolvedBy: "Jane Doe" } });
  });

  it("accepts the length limits exactly", () => {
    const result = parseResolveFindingForm({
      resolutionNote: "a".repeat(2000),
      resolvedBy: "b".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("accepts one character in each field", () => {
    expect(parseResolveFindingForm({ resolutionNote: "x", resolvedBy: "y" }).success).toBe(true);
  });

  it.each(["", "   ", "\n\t "])("rejects an empty resolution note %j", (resolutionNote) => {
    expect(parseResolveFindingForm({ ...valid, resolutionNote })).toEqual({
      success: false,
      fieldErrors: { resolutionNote: ["Enter a resolution note."] },
    });
  });

  it("rejects a resolution note over 2,000 characters", () => {
    expect(parseResolveFindingForm({ ...valid, resolutionNote: "a".repeat(2001) })).toEqual({
      success: false,
      fieldErrors: { resolutionNote: ["Resolution note must be 2,000 characters or fewer."] },
    });
  });

  it("measures the length after trimming", () => {
    const result = parseResolveFindingForm({ ...valid, resolutionNote: ` ${"a".repeat(2000)} ` });
    expect(result.success).toBe(true);
  });

  it.each(["", "  "])("rejects an empty resolved-by name %j", (resolvedBy) => {
    expect(parseResolveFindingForm({ ...valid, resolvedBy })).toEqual({
      success: false,
      fieldErrors: { resolvedBy: ["Enter who resolved this finding."] },
    });
  });

  it("rejects a resolved-by name over 200 characters", () => {
    expect(parseResolveFindingForm({ ...valid, resolvedBy: "b".repeat(201) })).toEqual({
      success: false,
      fieldErrors: { resolvedBy: ["Resolved by must be 200 characters or fewer."] },
    });
  });

  it("reports both fields at once", () => {
    expect(parseResolveFindingForm({ resolutionNote: "", resolvedBy: "" })).toEqual({
      success: false,
      fieldErrors: {
        resolutionNote: ["Enter a resolution note."],
        resolvedBy: ["Enter who resolved this finding."],
      },
    });
  });

  it.each([null, undefined, 42, new Blob(["x"]), ["Removed."]])(
    "treats a non-string value %j as empty",
    (value) => {
      expect(parseResolveFindingForm({ resolutionNote: value, resolvedBy: value })).toEqual({
        success: false,
        fieldErrors: {
          resolutionNote: ["Enter a resolution note."],
          resolvedBy: ["Enter who resolved this finding."],
        },
      });
    },
  );
});

describe("parseFindingNoteForm", () => {
  it("accepts and trims a note", () => {
    expect(parseFindingNoteForm({ note: "  IT investigating with employee. " })).toEqual({
      success: true,
      data: { note: "IT investigating with employee." },
    });
  });

  it("accepts 1 and 2,000 characters", () => {
    expect(parseFindingNoteForm({ note: "x" }).success).toBe(true);
    expect(parseFindingNoteForm({ note: "a".repeat(2000) }).success).toBe(true);
  });

  it.each(["", " ", "\n"])("rejects an empty note %j", (note) => {
    expect(parseFindingNoteForm({ note })).toEqual({
      success: false,
      fieldErrors: { note: ["Enter a note."] },
    });
  });

  it("rejects a note over 2,000 characters", () => {
    expect(parseFindingNoteForm({ note: "a".repeat(2001) })).toEqual({
      success: false,
      fieldErrors: { note: ["Note must be 2,000 characters or fewer."] },
    });
  });

  it.each([null, undefined, 1, new Blob(["x"])])("treats a non-string value %j as empty", (note) => {
    expect(parseFindingNoteForm({ note })).toEqual({
      success: false,
      fieldErrors: { note: ["Enter a note."] },
    });
  });
});

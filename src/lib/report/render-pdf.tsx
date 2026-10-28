import "server-only";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ReportException, ReportModel } from "./model";

// Draws the report model as a PDF. No data logic here: every string comes
// from buildReportModel, already reduced to what Helvetica can draw.

const styles = StyleSheet.create({
  // No lineHeight anywhere: on the Page it stops the render-prop page counter
  // from drawing, and on a style it inflates row heights (react-pdf 4.9.0).
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, color: "#18181b" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 12 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 18, marginBottom: 6 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 4 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, color: "#52525b" },
  value: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  card: { borderTopWidth: 1, borderTopColor: "#d4d4d8", paddingTop: 8, marginTop: 8 },
  sub: { marginTop: 4, marginLeft: 12 },
  note: { marginBottom: 3 },
  muted: { color: "#52525b" },
  scope: { marginTop: 18, padding: 8, borderWidth: 1, borderColor: "#a1a1aa" },
  // A render-prop Text has no content at layout time, so both edges are set
  // to give it a known width.
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#71717a" },
});

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={mono ? [styles.value, styles.mono] : styles.value}>{value}</Text>
    </View>
  );
}

function ExceptionBlock({ exception, index }: { exception: ReportException; index: number }) {
  const rule = exception.policyRule;
  return (
    // Breakable: an exception with many notes can be taller than a page. The
    // heading moves to the next page rather than sit alone at the bottom.
    <View style={styles.card}>
      <Text style={styles.h3} minPresenceAhead={60}>
        {index + 1}. {exception.application}
      </Text>
      <Field label="Application ID" value={exception.applicationId} />
      <Field label="Affected user" value={exception.user} />
      <Field label="Observed permission" value={exception.permission} />
      <Field label="Evidence source" value={exception.evidenceSource} />
      <Field label="Observed" value={exception.observed} />
      <Field label="Status" value={exception.status} />
      <Field label="Remediation note" value={exception.remediationNote} />
      {exception.status === "Resolved" ? (
        <>
          <Field label="Resolved by" value={exception.resolvedBy ?? ""} />
          <Field label="Recorded account" value={exception.recordedAccount ?? ""} />
          <Field label="Resolved at" value={exception.resolvedAt ?? ""} />
        </>
      ) : null}
      <Text style={[styles.label, { marginTop: 4 }]}>Policy rule</Text>
      <View style={styles.sub}>
        {rule ? (
          <>
            <Field label="Rule" value={rule.appName} />
            <Field label="Status" value={rule.status} />
            <Field label="Approved users" value={rule.approvedUsers} />
            <Field label="Allowed permissions" value={rule.allowedPermissions} />
            <Field label="Prohibited permissions" value={rule.prohibitedPermissions} />
            <Field label="Matched by" value={rule.matchedBy} />
          </>
        ) : (
          <Text style={styles.muted}>No policy rule</Text>
        )}
      </View>
      {exception.notes.length > 0 ? (
        <>
          <Text style={[styles.label, { marginTop: 4 }]}>Notes</Text>
          <View style={styles.sub}>
            {exception.notes.map((note, i) => (
              <Text key={i} style={styles.note}>
                {note.text} <Text style={styles.muted}>({note.author}, {note.at})</Text>
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function ReportDocument({ model }: { model: ReportModel }) {
  const { header, summary, integrity } = model;
  return (
    <Document
      title={model.metadata.title}
      author={model.metadata.author}
      creator={model.metadata.author}
      producer={model.metadata.author}
      creationDate={model.metadata.creationDate}
      modificationDate={model.metadata.creationDate}
    >
      <Page size="A4" style={styles.page}>
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Report ${header.reportId}  |  Page ${pageNumber} of ${totalPages}`
          }
        />
        <Text style={styles.title}>{model.title}</Text>
        <Field label="Company" value={header.company} />
        <Field label="Review" value={header.reviewName} />
        <Field label="Review date" value={header.reviewDate} />
        <Field label="Reviewer" value={header.reviewer} />
        <Field label="Report ID" value={header.reportId} mono />
        <Field label="Finalized" value={header.finalizedAt} />
        <Field label="Finalized by" value={header.finalizedBy} />

        <Text style={styles.h2}>Executive summary</Text>
        <Text>{summary.sentence}</Text>

        <Text style={styles.h2}>Policy exceptions</Text>
        {model.exceptions.length === 0 ? (
          <Text style={styles.muted}>{model.noExceptionsText}</Text>
        ) : (
          model.exceptions.map((exception, index) => (
            <ExceptionBlock key={index} exception={exception} index={index} />
          ))
        )}

        <View wrap={false}>
          <Text style={styles.h2}>Evidence integrity</Text>
          <Field label="Evidence file" value={integrity.evidenceFileName} />
          <Field label="Evidence SHA-256" value={integrity.evidenceSha256} mono />
          <Field label="Microsoft export SHA-256" value={integrity.rawExportSha256} mono />
        </View>

        <View style={styles.scope} wrap={false}>
          <Text style={styles.h3}>Scope</Text>
          <Text>{model.scopeStatement}</Text>
          <Text style={{ marginTop: 6 }}>{model.disclaimer}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(model: ReportModel): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<ReportDocument model={model} />);
  return new Uint8Array(buffer);
}

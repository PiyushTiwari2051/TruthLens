import type { DocumentAnalysisLine, TruthLensAnalyzeResponse } from "@/types/truthlensAnalyze";

function normalizeRow(item: unknown): DocumentAnalysisLine | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const line = String(o.line ?? o.text ?? o.content ?? o.line_text ?? "").trimEnd();
  if (!line.trim()) return null;
  let auth = String(o.authenticity ?? o.Authenticity ?? o.verdict ?? o.label ?? "UNVERIFIED")
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (auth === "REFUTED" || auth === "FALSE") auth = "FAKE";
  if (auth === "SUPPORTED" || auth === "TRUE") auth = "REAL";
  if (auth === "MISLEADING_CONTEXT") auth = "MISLEADING";
  if (auth === "UNVERIFIABLE") auth = "UNVERIFIED";
  if (!["REAL", "FAKE", "MISLEADING", "UNVERIFIED"].includes(auth)) auth = "UNVERIFIED";
  const reasoning = o.reasoning != null ? String(o.reasoning)
    : o.evidence != null ? String(o.evidence) : undefined;
  return { line, authenticity: auth, reasoning };
}

/** Rows for UI + PDF: prefer API document_analysis; else rebuild from source_document_text (older edge). */
export function getDocumentAnalysisRows(data: TruthLensAnalyzeResponse): DocumentAnalysisLine[] {
  const raw = data.report?.document_analysis;
  if (Array.isArray(raw) && raw.length > 0) {
    const rows = raw.map(normalizeRow).filter((x): x is DocumentAnalysisLine => x !== null);
    if (rows.length) return rows;
  }
  const src = typeof data.source_document_text === "string" ? data.source_document_text : "";
  if (!src.trim()) return [];
  return src
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .map((line) => ({
      line,
      authenticity: "UNVERIFIED",
      reasoning: "Line rebuilt from source text — redeploy the analyze function for full model line verdicts.",
    }));
}

export function isFakeAuthenticity(auth: string | undefined): boolean {
  const a = (auth ?? "").toUpperCase();
  return a === "FAKE" || a === "REFUTED" || a === "FALSE";
}

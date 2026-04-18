/** Shape returned from Supabase `analyze` edge function (subset used by UI). */
export type TruthLensAnalyzeResponse = {
  ok?: boolean;
  report?: TruthReport;
  /** Echo of analysed document body for client-side fallback when document_analysis is missing. */
  source_document_text?: string;
  processing_ms?: number;
  pgvector_matches?: Array<Record<string, unknown>>;
  qdrant_matches?: Array<Record<string, unknown>>;
  error?: string;
};

export type DocumentAnalysisLine = {
  line: string;
  authenticity: string;
  reasoning?: string;
};

export type TruthReport = {
  detected_language?: string;
  modality?: string;
  truth_score?: number;
  satya_score?: number;
  overall_verdict?: string;
  summary?: string;
  whatsapp_alert?: string;
  claims?: Array<{
    text?: string;
    verdict?: string;
    subject?: string;
    predicate?: string;
    object?: string;
    evidence?: string;
  }>;
  manipulation_techniques?: string[];
  forensic_signals?: {
    ai_generated_probability?: number;
    emotional_manipulation_score?: number;
    false_urgency?: boolean;
    false_authority?: boolean;
    deepfake_probability?: number;
    voice_clone_probability?: number;
    exif_anomaly?: boolean;
    out_of_context?: boolean;
    source_credibility?: number;
  };
  video_specific_signals?: {
    lip_sync_offset_ms?: number;
    face_boundary_anomaly?: boolean;
    temporal_inconsistency?: boolean;
  };
  audio_specific_signals?: {
    mfcc_jitter?: number;
    mfcc_shimmer?: number;
    splicing_detected?: boolean;
    synthesis_tool_signature?: string;
  };
  document_analysis?: DocumentAnalysisLine[];
  evidence_sources?: Array<{
    organisation?: string;
    finding?: string;
    stance?: string;
    url?: string;
  }>;
  rebuttal_native?: string;
  rebuttal_english?: string;
  counter_narrative?: string;
  topic_tags?: string[];
  multimodal_explain?: string;
};

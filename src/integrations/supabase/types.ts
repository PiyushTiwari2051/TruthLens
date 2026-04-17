export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          claims: Json
          created_at: string
          detected_language: string | null
          evidence_sources: Json
          forensic_signals: Json
          id: string
          input_modality: Database["public"]["Enums"]["modality"]
          input_text: string | null
          input_url: string | null
          manipulation_techniques: string[]
          model_used: string | null
          overall_verdict: Database["public"]["Enums"]["verdict"]
          processing_ms: number | null
          qdrant_matches: Json
          rebuttal_english: string | null
          rebuttal_native: string | null
          truth_score: number
          whatsapp_alert: string | null
        }
        Insert: {
          claims?: Json
          created_at?: string
          detected_language?: string | null
          evidence_sources?: Json
          forensic_signals?: Json
          id?: string
          input_modality: Database["public"]["Enums"]["modality"]
          input_text?: string | null
          input_url?: string | null
          manipulation_techniques?: string[]
          model_used?: string | null
          overall_verdict: Database["public"]["Enums"]["verdict"]
          processing_ms?: number | null
          qdrant_matches?: Json
          rebuttal_english?: string | null
          rebuttal_native?: string | null
          truth_score: number
          whatsapp_alert?: string | null
        }
        Update: {
          claims?: Json
          created_at?: string
          detected_language?: string | null
          evidence_sources?: Json
          forensic_signals?: Json
          id?: string
          input_modality?: Database["public"]["Enums"]["modality"]
          input_text?: string | null
          input_url?: string | null
          manipulation_techniques?: string[]
          model_used?: string | null
          overall_verdict?: Database["public"]["Enums"]["verdict"]
          processing_ms?: number | null
          qdrant_matches?: Json
          rebuttal_english?: string | null
          rebuttal_native?: string | null
          truth_score?: number
          whatsapp_alert?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          claim_text: string
          confidence: number
          counter_narrative: string | null
          created_at: string
          date_checked: string
          embedding: string | null
          id: string
          language: string
          modality: Database["public"]["Enums"]["modality"]
          region: string | null
          source_dataset: string
          sources: string[]
          topic_tags: string[]
          verdict: Database["public"]["Enums"]["verdict"]
          virality_score: number | null
        }
        Insert: {
          claim_text: string
          confidence?: number
          counter_narrative?: string | null
          created_at?: string
          date_checked?: string
          embedding?: string | null
          id?: string
          language?: string
          modality?: Database["public"]["Enums"]["modality"]
          region?: string | null
          source_dataset?: string
          sources?: string[]
          topic_tags?: string[]
          verdict: Database["public"]["Enums"]["verdict"]
          virality_score?: number | null
        }
        Update: {
          claim_text?: string
          confidence?: number
          counter_narrative?: string | null
          created_at?: string
          date_checked?: string
          embedding?: string | null
          id?: string
          language?: string
          modality?: Database["public"]["Enums"]["modality"]
          region?: string | null
          source_dataset?: string
          sources?: string[]
          topic_tags?: string[]
          verdict?: Database["public"]["Enums"]["verdict"]
          virality_score?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_claims: {
        Args: {
          match_count?: number
          match_language?: string
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          claim_text: string
          confidence: number
          counter_narrative: string
          date_checked: string
          id: string
          language: string
          similarity: number
          sources: string[]
          topic_tags: string[]
          verdict: Database["public"]["Enums"]["verdict"]
        }[]
      }
    }
    Enums: {
      modality: "text" | "image" | "audio" | "video" | "url" | "document"
      verdict:
        | "TRUE"
        | "FALSE"
        | "MISLEADING"
        | "UNVERIFIABLE"
        | "SATIRE"
        | "CONTESTED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      modality: ["text", "image", "audio", "video", "url", "document"],
      verdict: [
        "TRUE",
        "FALSE",
        "MISLEADING",
        "UNVERIFIABLE",
        "SATIRE",
        "CONTESTED",
      ],
    },
  },
} as const

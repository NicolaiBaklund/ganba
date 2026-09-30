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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_baselines: {
        Row: {
          created_at: string
          id: string
          other_training_hours_per_week: number
          run_km_per_week: number
          steps_per_day: number
          updated_at: string
          user_id: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          other_training_hours_per_week?: number
          run_km_per_week?: number
          steps_per_day: number
          updated_at?: string
          user_id: string
          valid_from: string
        }
        Update: {
          created_at?: string
          id?: string
          other_training_hours_per_week?: number
          run_km_per_week?: number
          steps_per_day?: number
          updated_at?: string
          user_id?: string
          valid_from?: string
        }
        Relationships: []
      }
      ai_estimates: {
        Row: {
          cost_usd: number | null
          created_at: string
          error: string | null
          food_entry_id: string | null
          id: string
          input_text: string | null
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          parent_estimate_id: string | null
          photo_paths: string[]
          prompt_version: number
          response: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          food_entry_id?: string | null
          id?: string
          input_text?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          parent_estimate_id?: string | null
          photo_paths?: string[]
          prompt_version: number
          response?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          food_entry_id?: string | null
          id?: string
          input_text?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          parent_estimate_id?: string | null
          photo_paths?: string[]
          prompt_version?: number
          response?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_estimates_food_entry_id_fkey"
            columns: ["food_entry_id"]
            isOneToOne: false
            referencedRelation: "food_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_estimates_parent_estimate_id_fkey"
            columns: ["parent_estimate_id"]
            isOneToOne: false
            referencedRelation: "ai_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          id: string
          iv: string
          last4: string
          provider: string
          updated_at: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          id?: string
          iv: string
          last4: string
          provider?: string
          updated_at?: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          id?: string
          iv?: string
          last4?: string
          provider?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      energy_plans: {
        Row: {
          base_expenditure_kcal: number
          checkin_id: string | null
          created_at: string
          fat_pct: number
          id: string
          manual_kcal_override: number | null
          protein_g_per_kg: number
          source: Database["public"]["Enums"]["energy_source"]
          updated_at: string
          user_id: string
          valid_from: string
        }
        Insert: {
          base_expenditure_kcal: number
          checkin_id?: string | null
          created_at?: string
          fat_pct: number
          id?: string
          manual_kcal_override?: number | null
          protein_g_per_kg: number
          source: Database["public"]["Enums"]["energy_source"]
          updated_at?: string
          user_id: string
          valid_from: string
        }
        Update: {
          base_expenditure_kcal?: number
          checkin_id?: string | null
          created_at?: string
          fat_pct?: number
          id?: string
          manual_kcal_override?: number | null
          protein_g_per_kg?: number
          source?: Database["public"]["Enums"]["energy_source"]
          updated_at?: string
          user_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_plans_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "weekly_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      food_entries: {
        Row: {
          created_at: string
          id: string
          local_date: string
          logged_at: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          source: Database["public"]["Enums"]["food_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          local_date: string
          logged_at: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          source: Database["public"]["Enums"]["food_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          local_date?: string
          logged_at?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          source?: Database["public"]["Enums"]["food_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      food_items: {
        Row: {
          carbs_g: number
          confidence: Database["public"]["Enums"]["confidence"] | null
          created_at: string
          fat_g: number
          food_entry_id: string
          grams: number | null
          id: string
          kcal: number
          name: string
          protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          carbs_g?: number
          confidence?: Database["public"]["Enums"]["confidence"] | null
          created_at?: string
          fat_g?: number
          food_entry_id: string
          grams?: number | null
          id?: string
          kcal: number
          name: string
          protein_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          carbs_g?: number
          confidence?: Database["public"]["Enums"]["confidence"] | null
          created_at?: string
          fat_g?: number
          food_entry_id?: string
          grams?: number | null
          id?: string
          kcal?: number
          name?: string
          protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_items_food_entry_id_fkey"
            columns: ["food_entry_id"]
            isOneToOne: false
            referencedRelation: "food_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          id: string
          rate_kg_per_week: number
          target_weight_kg: number
          updated_at: string
          user_id: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          rate_kg_per_week: number
          target_weight_kg: number
          updated_at?: string
          user_id: string
          valid_from: string
        }
        Update: {
          created_at?: string
          id?: string
          rate_kg_per_week?: number
          target_weight_kg?: number
          updated_at?: string
          user_id?: string
          valid_from?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          bucket: Database["public"]["Enums"]["photo_bucket"]
          created_at: string
          food_entry_id: string | null
          id: string
          storage_path: string
          updated_at: string
          user_id: string
          weight_entry_id: string | null
        }
        Insert: {
          bucket: Database["public"]["Enums"]["photo_bucket"]
          created_at?: string
          food_entry_id?: string | null
          id?: string
          storage_path: string
          updated_at?: string
          user_id: string
          weight_entry_id?: string | null
        }
        Update: {
          bucket?: Database["public"]["Enums"]["photo_bucket"]
          created_at?: string
          food_entry_id?: string | null
          id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
          weight_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_food_entry_id_fkey"
            columns: ["food_entry_id"]
            isOneToOne: false
            referencedRelation: "food_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_weight_entry_id_fkey"
            columns: ["weight_entry_id"]
            isOneToOne: false
            referencedRelation: "weight_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string
          checkin_weekday: number
          created_at: string
          height_cm: number
          locale: string
          onboarded_at: string | null
          sex: Database["public"]["Enums"]["sex"]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date: string
          checkin_weekday?: number
          created_at?: string
          height_cm: number
          locale?: string
          onboarded_at?: string | null
          sex: Database["public"]["Enums"]["sex"]
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string
          checkin_weekday?: number
          created_at?: string
          height_cm?: number
          locale?: string
          onboarded_at?: string | null
          sex?: Database["public"]["Enums"]["sex"]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_checkins: {
        Row: {
          avg_intake_kcal: number | null
          avg_training_kcal: number | null
          computed_base_kcal: number | null
          created_at: string
          id: string
          logged_days: number | null
          proposed_base_kcal: number | null
          reason: string | null
          status: Database["public"]["Enums"]["checkin_status"]
          trend_change_kg: number | null
          updated_at: string
          user_id: string
          week_start: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          avg_intake_kcal?: number | null
          avg_training_kcal?: number | null
          computed_base_kcal?: number | null
          created_at?: string
          id?: string
          logged_days?: number | null
          proposed_base_kcal?: number | null
          reason?: string | null
          status: Database["public"]["Enums"]["checkin_status"]
          trend_change_kg?: number | null
          updated_at?: string
          user_id: string
          week_start: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          avg_intake_kcal?: number | null
          avg_training_kcal?: number | null
          computed_base_kcal?: number | null
          created_at?: string
          id?: string
          logged_days?: number | null
          proposed_base_kcal?: number | null
          reason?: string | null
          status?: Database["public"]["Enums"]["checkin_status"]
          trend_change_kg?: number | null
          updated_at?: string
          user_id?: string
          week_start?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      weight_entries: {
        Row: {
          created_at: string
          id: string
          local_date: string
          measured_at: string
          source: string
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          local_date: string
          measured_at: string
          source?: string
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          local_date?: string
          measured_at?: string
          source?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      daily_intake: {
        Row: {
          carbs_g: number | null
          fat_g: number | null
          kcal: number | null
          local_date: string | null
          protein_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      checkin_status: "pending" | "accepted" | "kept" | "insufficient_data"
      confidence: "low" | "medium" | "high"
      energy_source: "formula" | "adaptive" | "manual"
      food_source: "ai" | "quick"
      meal_type: "breakfast" | "lunch" | "dinner" | "evening" | "snack"
      photo_bucket: "food" | "body"
      sex: "male" | "female"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      checkin_status: ["pending", "accepted", "kept", "insufficient_data"],
      confidence: ["low", "medium", "high"],
      energy_source: ["formula", "adaptive", "manual"],
      food_source: ["ai", "quick"],
      meal_type: ["breakfast", "lunch", "dinner", "evening", "snack"],
      photo_bucket: ["food", "body"],
      sex: ["male", "female"],
    },
  },
} as const

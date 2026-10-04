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
      activities: {
        Row: {
          avg_hr: number | null
          created_at: string
          distance_m: number | null
          duration_s: number | null
          elevation_gain_m: number | null
          garmin_activity_id: number
          garmin_kcal: number | null
          hr_zones: Json | null
          id: string
          local_date: string
          max_hr: number | null
          moving_s: number | null
          name: string | null
          raw: Json | null
          splits: Json | null
          start_time: string
          steps: number | null
          te_aerobic: number | null
          te_anaerobic: number | null
          type_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          garmin_activity_id: number
          garmin_kcal?: number | null
          hr_zones?: Json | null
          id?: string
          local_date: string
          max_hr?: number | null
          moving_s?: number | null
          name?: string | null
          raw?: Json | null
          splits?: Json | null
          start_time: string
          steps?: number | null
          te_aerobic?: number | null
          te_anaerobic?: number | null
          type_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          garmin_activity_id?: number
          garmin_kcal?: number | null
          hr_zones?: Json | null
          id?: string
          local_date?: string
          max_hr?: number | null
          moving_s?: number | null
          name?: string | null
          raw?: Json | null
          splits?: Json | null
          start_time?: string
          steps?: number | null
          te_aerobic?: number | null
          te_anaerobic?: number | null
          type_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          alcohol_g: number
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
          alcohol_g?: number
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
          alcohol_g?: number
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
      garmin_accounts: {
        Row: {
          auth_tag: string
          ciphertext: string
          connected_at: string
          created_at: string
          history_imported_at: string | null
          iv: string
          last_synced_at: string | null
          last_synced_date: string | null
          race_predictions: Json | null
          race_predictions_at: string | null
          recovery_backfilled_until: string | null
          recovery_computed_at: string | null
          recovery_synced_until: string | null
          status: Database["public"]["Enums"]["garmin_status"]
          sync_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          connected_at?: string
          created_at?: string
          history_imported_at?: string | null
          iv: string
          last_synced_at?: string | null
          last_synced_date?: string | null
          race_predictions?: Json | null
          race_predictions_at?: string | null
          recovery_backfilled_until?: string | null
          recovery_computed_at?: string | null
          recovery_synced_until?: string | null
          status?: Database["public"]["Enums"]["garmin_status"]
          sync_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          connected_at?: string
          created_at?: string
          history_imported_at?: string | null
          iv?: string
          last_synced_at?: string | null
          last_synced_date?: string | null
          race_predictions?: Json | null
          race_predictions_at?: string | null
          recovery_backfilled_until?: string | null
          recovery_computed_at?: string | null
          recovery_synced_until?: string | null
          status?: Database["public"]["Enums"]["garmin_status"]
          sync_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      garmin_days: {
        Row: {
          created_at: string
          final: boolean
          id: string
          local_date: string
          raw: Json | null
          steps: number | null
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          final?: boolean
          id?: string
          local_date: string
          raw?: Json | null
          steps?: number | null
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          final?: boolean
          id?: string
          local_date?: string
          raw?: Json | null
          steps?: number | null
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      garmin_login_states: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          expires_at: string
          id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          expires_at: string
          id?: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          expires_at?: string
          id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      plan_proposals: {
        Row: {
          changes: Json
          cost_usd: number | null
          created_at: string
          id: string
          input_tokens: number | null
          kind: Database["public"]["Enums"]["proposal_kind"]
          model: string | null
          output_tokens: number | null
          plan_id: string
          request_text: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          changes: Json
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          kind: Database["public"]["Enums"]["proposal_kind"]
          model?: string | null
          output_tokens?: number | null
          plan_id: string
          request_text?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          changes?: Json
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          kind?: Database["public"]["Enums"]["proposal_kind"]
          model?: string | null
          output_tokens?: number | null
          plan_id?: string
          request_text?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_workouts: {
        Row: {
          activity_id: string | null
          blocks: Json
          created_at: string
          date: string
          fuel_advice: Json | null
          garmin_push_status: Database["public"]["Enums"]["garmin_push_status"]
          garmin_schedule_id: number | null
          garmin_workout_id: number | null
          id: string
          phase: string
          plan_id: string
          planned_duration_s: number
          planned_km: number
          status: Database["public"]["Enums"]["workout_status"]
          title: string
          type: Database["public"]["Enums"]["workout_type"]
          updated_at: string
          user_id: string
          week: number
        }
        Insert: {
          activity_id?: string | null
          blocks: Json
          created_at?: string
          date: string
          fuel_advice?: Json | null
          garmin_push_status?: Database["public"]["Enums"]["garmin_push_status"]
          garmin_schedule_id?: number | null
          garmin_workout_id?: number | null
          id?: string
          phase: string
          plan_id: string
          planned_duration_s: number
          planned_km: number
          status?: Database["public"]["Enums"]["workout_status"]
          title: string
          type: Database["public"]["Enums"]["workout_type"]
          updated_at?: string
          user_id: string
          week: number
        }
        Update: {
          activity_id?: string | null
          blocks?: Json
          created_at?: string
          date?: string
          fuel_advice?: Json | null
          garmin_push_status?: Database["public"]["Enums"]["garmin_push_status"]
          garmin_schedule_id?: number | null
          garmin_workout_id?: number | null
          id?: string
          phase?: string
          plan_id?: string
          planned_duration_s?: number
          planned_km?: number
          status?: Database["public"]["Enums"]["workout_status"]
          title?: string
          type?: Database["public"]["Enums"]["workout_type"]
          updated_at?: string
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "planned_workouts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
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
      recovery_days: {
        Row: {
          awake_s: number | null
          body_battery_charged: number | null
          created_at: string
          deep_s: number | null
          hrv_avg: number | null
          hrv_baseline_high: number | null
          hrv_baseline_low: number | null
          hrv_status: string | null
          id: string
          light_s: number | null
          local_date: string
          raw: Json | null
          rem_s: number | null
          resting_hr: number | null
          sleep_end: string | null
          sleep_s: number | null
          sleep_score: number | null
          sleep_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          awake_s?: number | null
          body_battery_charged?: number | null
          created_at?: string
          deep_s?: number | null
          hrv_avg?: number | null
          hrv_baseline_high?: number | null
          hrv_baseline_low?: number | null
          hrv_status?: string | null
          id?: string
          light_s?: number | null
          local_date: string
          raw?: Json | null
          rem_s?: number | null
          resting_hr?: number | null
          sleep_end?: string | null
          sleep_s?: number | null
          sleep_score?: number | null
          sleep_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          awake_s?: number | null
          body_battery_charged?: number | null
          created_at?: string
          deep_s?: number | null
          hrv_avg?: number | null
          hrv_baseline_high?: number | null
          hrv_baseline_low?: number | null
          hrv_status?: string | null
          id?: string
          light_s?: number | null
          local_date?: string
          raw?: Json | null
          rem_s?: number | null
          resting_hr?: number | null
          sleep_end?: string | null
          sleep_s?: number | null
          sleep_score?: number | null
          sleep_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_findings: {
        Row: {
          computed_at: string
          control_ok: boolean | null
          created_at: string
          effect_sd: number | null
          factor: string
          groups: Json
          id: string
          kind: string
          lag: number
          outcome: string
          p_value: number | null
          q_value: number | null
          question_id: string
          rank: number | null
          reason: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_at: string
          control_ok?: boolean | null
          created_at?: string
          effect_sd?: number | null
          factor: string
          groups: Json
          id?: string
          kind: string
          lag: number
          outcome: string
          p_value?: number | null
          q_value?: number | null
          question_id: string
          rank?: number | null
          reason?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_at?: string
          control_ok?: boolean | null
          created_at?: string
          effect_sd?: number | null
          factor?: string
          groups?: Json
          id?: string
          kind?: string
          lag?: number
          outcome?: string
          p_value?: number | null
          q_value?: number | null
          question_id?: string
          rank?: number | null
          reason?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_plans: {
        Row: {
          created_at: string
          did_quality: boolean
          distance_km: number | null
          experienced: boolean
          generated_until: string
          goal_kind: Database["public"]["Enums"]["plan_goal_kind"]
          id: string
          long_run_weekday: number
          race_date: string | null
          runs_per_week: number
          start_date: string
          start_km_per_week: number
          status: Database["public"]["Enums"]["plan_status"]
          target_time_s: number | null
          updated_at: string
          user_id: string
          vdot: number
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          did_quality?: boolean
          distance_km?: number | null
          experienced?: boolean
          generated_until: string
          goal_kind: Database["public"]["Enums"]["plan_goal_kind"]
          id?: string
          long_run_weekday: number
          race_date?: string | null
          runs_per_week: number
          start_date: string
          start_km_per_week: number
          status?: Database["public"]["Enums"]["plan_status"]
          target_time_s?: number | null
          updated_at?: string
          user_id: string
          vdot: number
          weekdays: number[]
        }
        Update: {
          created_at?: string
          did_quality?: boolean
          distance_km?: number | null
          experienced?: boolean
          generated_until?: string
          goal_kind?: Database["public"]["Enums"]["plan_goal_kind"]
          id?: string
          long_run_weekday?: number
          race_date?: string | null
          runs_per_week?: number
          start_date?: string
          start_km_per_week?: number
          status?: Database["public"]["Enums"]["plan_status"]
          target_time_s?: number | null
          updated_at?: string
          user_id?: string
          vdot?: number
          weekdays?: number[]
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
      energy_source: "formula" | "adaptive" | "manual" | "garmin_connect"
      food_source: "ai" | "quick"
      garmin_push_status: "none" | "pending" | "pushed" | "failed"
      garmin_status: "active" | "reauth_required"
      meal_type: "breakfast" | "lunch" | "dinner" | "evening" | "snack"
      photo_bucket: "food" | "body"
      plan_goal_kind: "race" | "build"
      plan_status: "active" | "completed" | "cancelled"
      proposal_kind: "missed" | "paces" | "volume" | "ai"
      proposal_status: "pending" | "accepted" | "rejected" | "stale"
      sex: "male" | "female"
      workout_status: "planned" | "done" | "missed" | "removed"
      workout_type:
        | "easy"
        | "long"
        | "intervals"
        | "threshold"
        | "tempo"
        | "strides"
        | "race"
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
      energy_source: ["formula", "adaptive", "manual", "garmin_connect"],
      food_source: ["ai", "quick"],
      garmin_push_status: ["none", "pending", "pushed", "failed"],
      garmin_status: ["active", "reauth_required"],
      meal_type: ["breakfast", "lunch", "dinner", "evening", "snack"],
      photo_bucket: ["food", "body"],
      plan_goal_kind: ["race", "build"],
      plan_status: ["active", "completed", "cancelled"],
      proposal_kind: ["missed", "paces", "volume", "ai"],
      proposal_status: ["pending", "accepted", "rejected", "stale"],
      sex: ["male", "female"],
      workout_status: ["planned", "done", "missed", "removed"],
      workout_type: [
        "easy",
        "long",
        "intervals",
        "threshold",
        "tempo",
        "strides",
        "race",
      ],
    },
  },
} as const

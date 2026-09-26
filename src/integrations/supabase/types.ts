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
      access_keys: {
        Row: {
          activated_at: string | null
          expires_at: string
          id: string
          issued_at: string
          issued_by: string | null
          owner_id: string | null
          revoked_at: string | null
          token: string
        }
        Insert: {
          activated_at?: string | null
          expires_at: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          owner_id?: string | null
          revoked_at?: string | null
          token: string
        }
        Update: {
          activated_at?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          owner_id?: string | null
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      dashboard_section_grants: {
        Row: {
          created_at: string
          section: string
          user_id: string
        }
        Insert: {
          created_at?: string
          section: string
          user_id: string
        }
        Update: {
          created_at?: string
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      dmca_batches: {
        Row: {
          created_at: string
          google_case_ref: string | null
          id: string
          order_id: string | null
          publication_date: string | null
          status: string
          submitted_at: string | null
          url_count: number
        }
        Insert: {
          created_at?: string
          google_case_ref?: string | null
          id?: string
          order_id?: string | null
          publication_date?: string | null
          status?: string
          submitted_at?: string | null
          url_count?: number
        }
        Update: {
          created_at?: string
          google_case_ref?: string | null
          id?: string
          order_id?: string | null
          publication_date?: string | null
          status?: string
          submitted_at?: string | null
          url_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "dmca_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "review_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_reports: {
        Row: {
          case_ref: string | null
          claimed_at: string
          error: string | null
          google_url: string | null
          id: string
          mode: string
          order_id: string | null
          our_url: string | null
          publication_date: string | null
          review_source_id: string | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          case_ref?: string | null
          claimed_at?: string
          error?: string | null
          google_url?: string | null
          id?: string
          mode?: string
          order_id?: string | null
          our_url?: string | null
          publication_date?: string | null
          review_source_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          case_ref?: string | null
          claimed_at?: string
          error?: string | null
          google_url?: string | null
          id?: string
          mode?: string
          order_id?: string | null
          our_url?: string | null
          publication_date?: string | null
          review_source_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dmca_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "review_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmca_reports_review_source_id_fkey"
            columns: ["review_source_id"]
            isOneToOne: false
            referencedRelation: "review_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          source: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          source?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      fake_review_comments: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          tag: string
          text: string
          times_used: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          tag?: string
          text: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          tag?: string
          text?: string
          times_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      fake_review_orders: {
        Row: {
          canonical_url: string | null
          comment_tag: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          feature_id: string | null
          fired_at: string | null
          id: string
          name: string
          note: string | null
          reason_code: string
          review_id: string | null
          shots_per_template: number
          status: string
          target_url: string
          template_ids: string[]
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          comment_tag?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          feature_id?: string | null
          fired_at?: string | null
          id?: string
          name: string
          note?: string | null
          reason_code?: string
          review_id?: string | null
          shots_per_template?: number
          status?: string
          target_url: string
          template_ids?: string[]
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          comment_tag?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          feature_id?: string | null
          fired_at?: string | null
          id?: string
          name?: string
          note?: string | null
          reason_code?: string
          review_id?: string | null
          shots_per_template?: number
          status?: string
          target_url?: string
          template_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      fake_review_shots: {
        Row: {
          error: string | null
          fired_at: string
          http_status: number | null
          id: string
          latency_ms: number | null
          order_id: string
          response_snippet: string | null
          sequence: number
          template_id: string | null
        }
        Insert: {
          error?: string | null
          fired_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          order_id: string
          response_snippet?: string | null
          sequence?: number
          template_id?: string | null
        }
        Update: {
          error?: string | null
          fired_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          order_id?: string
          response_snippet?: string | null
          sequence?: number
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fake_review_shots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "fake_review_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fake_review_shots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fake_review_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fake_review_templates: {
        Row: {
          auth_user_index: number
          body_kind: string
          body_template: string | null
          captured_at: string
          cookie_bundle: string | null
          created_at: string
          created_by: string | null
          endpoint_url: string
          google_email: string | null
          headers_json: Json
          id: string
          label: string
          last_error: string | null
          last_fired_at: string | null
          last_verified_at: string | null
          method: string
          notes: string | null
          shots_fired: number
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_index?: number
          body_kind?: string
          body_template?: string | null
          captured_at?: string
          cookie_bundle?: string | null
          created_at?: string
          created_by?: string | null
          endpoint_url: string
          google_email?: string | null
          headers_json?: Json
          id?: string
          label: string
          last_error?: string | null
          last_fired_at?: string | null
          last_verified_at?: string | null
          method?: string
          notes?: string | null
          shots_fired?: number
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_index?: number
          body_kind?: string
          body_template?: string | null
          captured_at?: string
          cookie_bundle?: string | null
          created_at?: string
          created_by?: string | null
          endpoint_url?: string
          google_email?: string | null
          headers_json?: Json
          id?: string
          label?: string
          last_error?: string | null
          last_fired_at?: string | null
          last_verified_at?: string | null
          method?: string
          notes?: string | null
          shots_fired?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      old_site_reviews: {
        Row: {
          business_name: string | null
          created_at: string
          created_by: string | null
          id: string
          review_date: string | null
          review_text: string
          reviewer_name: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          review_date?: string | null
          review_text: string
          reviewer_name: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          review_date?: string | null
          review_text?: string
          reviewer_name?: string
        }
        Relationships: []
      }
      policy_items: {
        Row: {
          business_name: string | null
          category: string | null
          check_error: string | null
          confidence: number | null
          created_at: string
          fetch_error: string | null
          fetch_status: string
          google_reason: string | null
          id: string
          label: string | null
          language: string | null
          order_id: string
          primary_tag: string | null
          rating: number | null
          reason: string | null
          report_error: string | null
          report_status: string
          report_text: string | null
          review_age_label: string | null
          review_published_at: string | null
          review_text: string | null
          reviewer_name: string | null
          signals: Json
          tags: Json
          translation: string | null
          updated_at: string
          url: string
          verdict: string | null
          verdict_manual: boolean
        }
        Insert: {
          business_name?: string | null
          category?: string | null
          check_error?: string | null
          confidence?: number | null
          created_at?: string
          fetch_error?: string | null
          fetch_status?: string
          google_reason?: string | null
          id?: string
          label?: string | null
          language?: string | null
          order_id: string
          primary_tag?: string | null
          rating?: number | null
          reason?: string | null
          report_error?: string | null
          report_status?: string
          report_text?: string | null
          review_age_label?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          signals?: Json
          tags?: Json
          translation?: string | null
          updated_at?: string
          url: string
          verdict?: string | null
          verdict_manual?: boolean
        }
        Update: {
          business_name?: string | null
          category?: string | null
          check_error?: string | null
          confidence?: number | null
          created_at?: string
          fetch_error?: string | null
          fetch_status?: string
          google_reason?: string | null
          id?: string
          label?: string | null
          language?: string | null
          order_id?: string
          primary_tag?: string | null
          rating?: number | null
          reason?: string | null
          report_error?: string | null
          report_status?: string
          report_text?: string | null
          review_age_label?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          signals?: Json
          tags?: Json
          translation?: string | null
          updated_at?: string
          url?: string
          verdict?: string | null
          verdict_manual?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "policy_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "policy_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          note: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          note?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          note?: string | null
          source?: string
        }
        Relationships: []
      }
      policy_training: {
        Row: {
          body: string
          code: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          source_url: string | null
          title: string | null
        }
        Insert: {
          body: string
          code?: string | null
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          source_url?: string | null
          title?: string | null
        }
        Update: {
          body?: string
          code?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          source_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      profile_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profile_targets: {
        Row: {
          canonical_url: string | null
          captured_at: string | null
          claimed_at: string | null
          contributor_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          order_id: string
          place_id: string | null
          reviewer_profile_url: string | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          canonical_url?: string | null
          captured_at?: string | null
          claimed_at?: string | null
          contributor_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          order_id: string
          place_id?: string | null
          reviewer_profile_url?: string | null
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          canonical_url?: string | null
          captured_at?: string | null
          claimed_at?: string | null
          contributor_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          order_id?: string
          place_id?: string | null
          reviewer_profile_url?: string | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_targets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "profile_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      report_one_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: []
      }
      report_one_orders: {
        Row: {
          category: string
          challenge_token: string | null
          comment_tag: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          region: string
          reporter_name: string
          review_ref: string | null
          review_url: string
          shots_accepted: number
          shots_sent: number
          status: string
          submitted_at: string | null
          updated_at: string
          visit_meta: string | null
        }
        Insert: {
          category?: string
          challenge_token?: string | null
          comment_tag?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          name: string
          region?: string
          reporter_name: string
          review_ref?: string | null
          review_url: string
          shots_accepted?: number
          shots_sent?: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          visit_meta?: string | null
        }
        Update: {
          category?: string
          challenge_token?: string | null
          comment_tag?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          region?: string
          reporter_name?: string
          review_ref?: string | null
          review_url?: string
          shots_accepted?: number
          shots_sent?: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          visit_meta?: string | null
        }
        Relationships: []
      }
      report_one_shots: {
        Row: {
          accepted: boolean
          created_at: string
          error: string | null
          fired_at: string | null
          google_email: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          order_id: string
          response_snippet: string | null
          status: string
          template_id: string | null
          template_label: string | null
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          error?: string | null
          fired_at?: string | null
          google_email?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          order_id: string
          response_snippet?: string | null
          status?: string
          template_id?: string | null
          template_label?: string | null
        }
        Update: {
          accepted?: boolean
          created_at?: string
          error?: string | null
          fired_at?: string | null
          google_email?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          order_id?: string
          response_snippet?: string | null
          status?: string
          template_id?: string | null
          template_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_one_shots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "report_one_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_one_shots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fake_review_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      review_orders: {
        Row: {
          created_at: string
          created_by: string | null
          dmca_delay_max_seconds: number
          dmca_delay_min_seconds: number
          dmca_next_allowed_at: string | null
          dmca_template_id: string | null
          dmca_url_mode: string
          id: string
          name: string
          note: string | null
          reviewer_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dmca_delay_max_seconds?: number
          dmca_delay_min_seconds?: number
          dmca_next_allowed_at?: string | null
          dmca_template_id?: string | null
          dmca_url_mode?: string
          id?: string
          name: string
          note?: string | null
          reviewer_key?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dmca_delay_max_seconds?: number
          dmca_delay_min_seconds?: number
          dmca_next_allowed_at?: string | null
          dmca_template_id?: string | null
          dmca_url_mode?: string
          id?: string
          name?: string
          note?: string | null
          reviewer_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_orders_dmca_template_id_fkey"
            columns: ["dmca_template_id"]
            isOneToOne: false
            referencedRelation: "dmca_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      review_slug_counter: {
        Row: {
          id: boolean
          last_value: number
        }
        Insert: {
          id?: boolean
          last_value?: number
        }
        Update: {
          id?: boolean
          last_value?: number
        }
        Relationships: []
      }
      review_sources: {
        Row: {
          archive_date: string | null
          archive_url: string | null
          business_name: string | null
          created_at: string
          created_by: string | null
          date_fallback: boolean
          dmca_batch_id: string | null
          dmca_generated_at: string | null
          dmca_original_link: string | null
          dmca_publication_date: string | null
          dmca_report_id: string | null
          dmca_reported_at: string | null
          drive_file_id: string | null
          drive_url: string | null
          error: string | null
          fetched_at: string | null
          id: string
          label: string | null
          order_id: string | null
          published_path: string | null
          published_profile_review_id: string | null
          published_review_date: string | null
          published_review_id: string | null
          published_slug: string | null
          rating: number | null
          review_age_label: string | null
          review_headline: string | null
          review_published_at: string | null
          review_text: string | null
          reviewer_name: string | null
          reviews_found: number
          screenshot_at: string | null
          screenshot_error: string | null
          screenshot_status: string
          status: string
          text_checked_at: string | null
          text_error: string | null
          updated_at: string
          url: string
        }
        Insert: {
          archive_date?: string | null
          archive_url?: string | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          date_fallback?: boolean
          dmca_batch_id?: string | null
          dmca_generated_at?: string | null
          dmca_original_link?: string | null
          dmca_publication_date?: string | null
          dmca_report_id?: string | null
          dmca_reported_at?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          label?: string | null
          order_id?: string | null
          published_path?: string | null
          published_profile_review_id?: string | null
          published_review_date?: string | null
          published_review_id?: string | null
          published_slug?: string | null
          rating?: number | null
          review_age_label?: string | null
          review_headline?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          reviews_found?: number
          screenshot_at?: string | null
          screenshot_error?: string | null
          screenshot_status?: string
          status?: string
          text_checked_at?: string | null
          text_error?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          archive_date?: string | null
          archive_url?: string | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          date_fallback?: boolean
          dmca_batch_id?: string | null
          dmca_generated_at?: string | null
          dmca_original_link?: string | null
          dmca_publication_date?: string | null
          dmca_report_id?: string | null
          dmca_reported_at?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          label?: string | null
          order_id?: string | null
          published_path?: string | null
          published_profile_review_id?: string | null
          published_review_date?: string | null
          published_review_id?: string | null
          published_slug?: string | null
          rating?: number | null
          review_age_label?: string | null
          review_headline?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          reviews_found?: number
          screenshot_at?: string | null
          screenshot_error?: string | null
          screenshot_status?: string
          status?: string
          text_checked_at?: string | null
          text_error?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sources_dmca_batch_id_fkey"
            columns: ["dmca_batch_id"]
            isOneToOne: false
            referencedRelation: "dmca_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sources_dmca_report_id_fkey"
            columns: ["dmca_report_id"]
            isOneToOne: false
            referencedRelation: "dmca_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sources_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "review_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sources_published_profile_review_id_fkey"
            columns: ["published_profile_review_id"]
            isOneToOne: false
            referencedRelation: "robiul_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sources_published_review_id_fkey"
            columns: ["published_review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewer_editors: {
        Row: {
          created_at: string
          reviewer_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reviewer_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          reviewer_key?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          headline: string
          id: string
          published: boolean
          rating: number
          review_date: string
          reviewer_location: string | null
          reviewer_name: string
          slug: string | null
          source_id: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          headline: string
          id?: string
          published?: boolean
          rating: number
          review_date?: string
          reviewer_location?: string | null
          reviewer_name: string
          slug?: string | null
          source_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          headline?: string
          id?: string
          published?: boolean
          rating?: number
          review_date?: string
          reviewer_location?: string | null
          reviewer_name?: string
          slug?: string | null
          source_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "review_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      robiul_reviews: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          headline: string
          id: string
          image_url: string | null
          published: boolean
          rating: number
          review_date: string
          reviewer_key: string
          slug: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          headline: string
          id?: string
          image_url?: string | null
          published?: boolean
          rating?: number
          review_date?: string
          reviewer_key?: string
          slug: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          headline?: string
          id?: string
          image_url?: string | null
          published?: boolean
          rating?: number
          review_date?: string
          reviewer_key?: string
          slug?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          owner_id: string
          unread_admin: number
          unread_user: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          owner_id: string
          unread_admin?: number
          unread_user?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          owner_id?: string
          unread_admin?: number
          unread_user?: number
        }
        Relationships: []
      }
      user_dmca_reports: {
        Row: {
          case_ref: string | null
          claimed_at: string | null
          created_at: string
          drive_url: string | null
          error: string | null
          google_url: string | null
          id: string
          note: string | null
          notice_text: string | null
          order_id: string | null
          our_publish_date: string | null
          our_url: string | null
          owner_id: string
          publication_date: string | null
          review_text: string | null
          reviewer_name: string | null
          source_id: string | null
          status: string
          submitted_at: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          case_ref?: string | null
          claimed_at?: string | null
          created_at?: string
          drive_url?: string | null
          error?: string | null
          google_url?: string | null
          id?: string
          note?: string | null
          notice_text?: string | null
          order_id?: string | null
          our_publish_date?: string | null
          our_url?: string | null
          owner_id: string
          publication_date?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          source_id?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          case_ref?: string | null
          claimed_at?: string | null
          created_at?: string
          drive_url?: string | null
          error?: string | null
          google_url?: string | null
          id?: string
          note?: string | null
          notice_text?: string | null
          order_id?: string | null
          our_publish_date?: string | null
          our_url?: string | null
          owner_id?: string
          publication_date?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          source_id?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dmca_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dmca_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_extension_keys: {
        Row: {
          created_at: string
          last_used_at: string | null
          owner_id: string
          token: string
        }
        Insert: {
          created_at?: string
          last_used_at?: string | null
          owner_id: string
          token: string
        }
        Update: {
          created_at?: string
          last_used_at?: string | null
          owner_id?: string
          token?: string
        }
        Relationships: []
      }
      user_fake_review_orders: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          owner_id: string
          reason_code: string
          status: string
          target_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          owner_id: string
          reason_code?: string
          status?: string
          target_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          owner_id?: string
          reason_code?: string
          status?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_policy_items: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          report_text: string | null
          review_text: string | null
          status: string
          updated_at: string
          url: string
          verdict: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          report_text?: string | null
          review_text?: string | null
          status?: string
          updated_at?: string
          url: string
          verdict?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          report_text?: string | null
          review_text?: string | null
          status?: string
          updated_at?: string
          url?: string
          verdict?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          handle: string
          id?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_review_orders: {
        Row: {
          created_at: string
          dmca_delay_max_seconds: number
          dmca_delay_min_seconds: number
          dmca_next_allowed_at: string | null
          dmca_rereport_count: number
          dmca_template_id: string | null
          dmca_url_mode: string
          id: string
          name: string
          note: string | null
          owner_id: string
          reviewer_profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dmca_delay_max_seconds?: number
          dmca_delay_min_seconds?: number
          dmca_next_allowed_at?: string | null
          dmca_rereport_count?: number
          dmca_template_id?: string | null
          dmca_url_mode?: string
          id?: string
          name: string
          note?: string | null
          owner_id: string
          reviewer_profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dmca_delay_max_seconds?: number
          dmca_delay_min_seconds?: number
          dmca_next_allowed_at?: string | null
          dmca_rereport_count?: number
          dmca_template_id?: string | null
          dmca_url_mode?: string
          id?: string
          name?: string
          note?: string | null
          owner_id?: string
          reviewer_profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_review_orders_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "user_reviewer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_review_sources: {
        Row: {
          business_name: string | null
          created_at: string
          date_fallback: boolean
          dmca_generated_at: string | null
          dmca_original_link: string | null
          dmca_publication_date: string | null
          dmca_report_id: string | null
          dmca_reported_at: string | null
          drive_file_id: string | null
          drive_url: string | null
          error: string | null
          fetched_at: string | null
          id: string
          label: string | null
          order_id: string
          owner_id: string
          published_path: string | null
          published_review_date: string | null
          published_review_id: string | null
          published_slug: string | null
          rating: number | null
          review_age_label: string | null
          review_headline: string | null
          review_published_at: string | null
          review_text: string | null
          reviewer_name: string | null
          screenshot_at: string | null
          screenshot_error: string | null
          screenshot_status: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          date_fallback?: boolean
          dmca_generated_at?: string | null
          dmca_original_link?: string | null
          dmca_publication_date?: string | null
          dmca_report_id?: string | null
          dmca_reported_at?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          label?: string | null
          order_id: string
          owner_id: string
          published_path?: string | null
          published_review_date?: string | null
          published_review_id?: string | null
          published_slug?: string | null
          rating?: number | null
          review_age_label?: string | null
          review_headline?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          screenshot_at?: string | null
          screenshot_error?: string | null
          screenshot_status?: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          date_fallback?: boolean
          dmca_generated_at?: string | null
          dmca_original_link?: string | null
          dmca_publication_date?: string | null
          dmca_report_id?: string | null
          dmca_reported_at?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          label?: string | null
          order_id?: string
          owner_id?: string
          published_path?: string | null
          published_review_date?: string | null
          published_review_id?: string | null
          published_slug?: string | null
          rating?: number | null
          review_age_label?: string | null
          review_headline?: string | null
          review_published_at?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          screenshot_at?: string | null
          screenshot_error?: string | null
          screenshot_status?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_review_sources_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "user_review_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_review_sources_published_review_id_fkey"
            columns: ["published_review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reviewer_profiles: {
        Row: {
          age: number
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          age?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          age?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_reviews: {
        Row: {
          body: string
          created_at: string
          headline: string
          id: string
          image_url: string | null
          owner_id: string
          published: boolean
          rating: number
          review_date: string
          reviewer_profile_id: string | null
          slug: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          headline: string
          id?: string
          image_url?: string | null
          owner_id: string
          published?: boolean
          rating: number
          review_date?: string
          reviewer_profile_id?: string | null
          slug: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          headline?: string
          id?: string
          image_url?: string | null
          owner_id?: string
          published?: boolean
          rating?: number
          review_date?: string
          reviewer_profile_id?: string | null
          slug?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reviews_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "user_reviewer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_access_key: { Args: { _token: string }; Returns: Json }
      admin_list_users: {
        Args: never
        Returns: {
          active_key_expires_at: string
          created_at: string
          email: string
          key_status: string
          unread_admin: number
          user_id: string
        }[]
      }
      can_edit_reviewer: {
        Args: { _reviewer_key: string; _user_id: string }
        Returns: boolean
      }
      can_use_section: {
        Args: { _section: string; _user_id: string }
        Returns: boolean
      }
      has_active_key: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_review_slug: { Args: never; Returns: string }
      submit_review: {
        Args: {
          _body: string
          _headline: string
          _rating: number
          _reviewer_location: string
          _reviewer_name: string
          _subject: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin"
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
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const

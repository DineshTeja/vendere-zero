export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ad_metrics: {
        Row: {
          ad_id: string
          clicks: number
          ctr: number | null
          id: string
          impressions: number
        }
        Insert: {
          ad_id: string
          clicks?: number
          ctr?: number | null
          id?: string
          impressions?: number
        }
        Update: {
          ad_id?: string
          clicks?: number
          ctr?: number | null
          id?: string
          impressions?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_structured_output"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_structured_output: {
        Row: {
          description_embeddings: string | null
          id: string
          image_description: string
          image_url: string
          name: string | null
          user: string | null
        }
        Insert: {
          description_embeddings?: string | null
          id?: string
          image_description: string
          image_url: string
          name?: string | null
          user?: string | null
        }
        Update: {
          description_embeddings?: string | null
          id?: string
          image_description?: string
          image_url?: string
          name?: string | null
          user?: string | null
        }
        Relationships: []
      }
      citation_research: {
        Row: {
          buying_stage: string
          competitor_brands: string[]
          created_at: string | null
          id: string
          image_url: string
          intent_summary: string
          key_features: Json
          keywords: string[]
          market_segments: Json
          price_points: Json
          primary_intent: string
          seasonal_factors: string[] | null
          secondary_intents: string[]
          site_url: string
          user_id: string | null
        }
        Insert: {
          buying_stage: string
          competitor_brands: string[]
          created_at?: string | null
          id?: string
          image_url: string
          intent_summary: string
          key_features: Json
          keywords: string[]
          market_segments: Json
          price_points: Json
          primary_intent: string
          seasonal_factors?: string[] | null
          secondary_intents: string[]
          site_url: string
          user_id?: string | null
        }
        Update: {
          buying_stage?: string
          competitor_brands?: string[]
          created_at?: string | null
          id?: string
          image_url?: string
          intent_summary?: string
          key_features?: Json
          keywords?: string[]
          market_segments?: Json
          price_points?: Json
          primary_intent?: string
          seasonal_factors?: string[] | null
          secondary_intents?: string[]
          site_url?: string
          user_id?: string | null
        }
        Relationships: []
      }
      enhanced_ad_metrics: {
        Row: {
          ad_id: string
          campaign_id: string | null
          channel: string
          clicks: number
          conversion_rate: number
          conversions: number
          cost: number
          cpc: number
          cpm: number
          created_at: string | null
          ctr: number
          date: string
          demographics: Json | null
          device_metrics: Json | null
          engagement: Json | null
          id: string
          impressions: number
          placement: Json | null
          quality_score: number
          roas: number
          updated_at: string | null
          viewability_rate: number
          viewable_impressions: number
        }
        Insert: {
          ad_id: string
          campaign_id?: string | null
          channel: string
          clicks?: number
          conversion_rate?: number
          conversions?: number
          cost?: number
          cpc?: number
          cpm?: number
          created_at?: string | null
          ctr?: number
          date: string
          demographics?: Json | null
          device_metrics?: Json | null
          engagement?: Json | null
          id?: string
          impressions?: number
          placement?: Json | null
          quality_score?: number
          roas?: number
          updated_at?: string | null
          viewability_rate?: number
          viewable_impressions?: number
        }
        Update: {
          ad_id?: string
          campaign_id?: string | null
          channel?: string
          clicks?: number
          conversion_rate?: number
          conversions?: number
          cost?: number
          cpc?: number
          cpm?: number
          created_at?: string | null
          ctr?: number
          date?: string
          demographics?: Json | null
          device_metrics?: Json | null
          engagement?: Json | null
          id?: string
          impressions?: number
          placement?: Json | null
          quality_score?: number
          roas?: number
          updated_at?: string | null
          viewability_rate?: number
          viewable_impressions?: number
        }
        Relationships: []
      }
      features: {
        Row: {
          ad_output_id: string
          category: string
          confidence_score: number
          id: string
          keyword: string
          location: string
          user: string | null
        }
        Insert: {
          ad_output_id: string
          category: string
          confidence_score: number
          id?: string
          keyword: string
          location: string
          user?: string | null
        }
        Update: {
          ad_output_id?: string
          category?: string
          confidence_score?: number
          id?: string
          keyword?: string
          location?: string
          user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "features_ad_output_id_fkey"
            columns: ["ad_output_id"]
            isOneToOne: false
            referencedRelation: "ad_structured_output"
            referencedColumns: ["id"]
          },
        ]
      }
      google_image_ads: {
        Row: {
          ad_description: string | null
          advertisement_url: string
          advertiser_name: string | null
          advertiser_url: string | null
          created_at: string | null
          image_url: string | null
          last_shown: string | null
          updated_at: string | null
        }
        Insert: {
          ad_description?: string | null
          advertisement_url: string
          advertiser_name?: string | null
          advertiser_url?: string | null
          created_at?: string | null
          image_url?: string | null
          last_shown?: string | null
          updated_at?: string | null
        }
        Update: {
          ad_description?: string | null
          advertisement_url?: string
          advertiser_name?: string | null
          advertiser_url?: string | null
          created_at?: string | null
          image_url?: string | null
          last_shown?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      keyword_variants: {
        Row: {
          audience_segment: string | null
          competition_percentage: number
          confidence_score: number
          cpc: number
          created_at: string | null
          efficiency_index: number
          explanation: string
          geo_target: string | null
          id: string
          image_url: string | null
          keyword: string
          keyword_difficulty: number
          predicted_performance: number | null
          search_volume: number
          source: string
          user_id: string | null
          variant_id: string
        }
        Insert: {
          audience_segment?: string | null
          competition_percentage: number
          confidence_score: number
          cpc: number
          created_at?: string | null
          efficiency_index: number
          explanation: string
          geo_target?: string | null
          id?: string
          image_url?: string | null
          keyword: string
          keyword_difficulty: number
          predicted_performance?: number | null
          search_volume: number
          source: string
          user_id?: string | null
          variant_id: string
        }
        Update: {
          audience_segment?: string | null
          competition_percentage?: number
          confidence_score?: number
          cpc?: number
          created_at?: string | null
          efficiency_index?: number
          explanation?: string
          geo_target?: string | null
          id?: string
          image_url?: string | null
          keyword?: string
          keyword_difficulty?: number
          predicted_performance?: number | null
          search_volume?: number
          source?: string
          user_id?: string | null
          variant_id?: string
        }
        Relationships: []
      }
      library_items: {
        Row: {
          avg_sentiment_confidence: number | null
          created_at: string | null
          description: string | null
          features: string[] | null
          id: string
          item_id: string | null
          name: string | null
          preview_url: string | null
          sentiment_tones: string[] | null
          type: Database["public"]["Enums"]["library_item_type"]
          user_id: string | null
        }
        Insert: {
          avg_sentiment_confidence?: number | null
          created_at?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          item_id?: string | null
          name?: string | null
          preview_url?: string | null
          sentiment_tones?: string[] | null
          type: Database["public"]["Enums"]["library_item_type"]
          user_id?: string | null
        }
        Update: {
          avg_sentiment_confidence?: number | null
          created_at?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          item_id?: string | null
          name?: string | null
          preview_url?: string | null
          sentiment_tones?: string[] | null
          type?: Database["public"]["Enums"]["library_item_type"]
          user_id?: string | null
        }
        Relationships: []
      }
      market_research_v2: {
        Row: {
          buying_stage: string
          citations: string[]
          competitive_advantages: Json
          created_at: string
          id: string
          image_url: string
          intent_summary: string
          key_features: Json
          keywords: Json[] | null
          new_headlines: Json[] | null
          original_headlines: Json[] | null
          pain_points: Json
          perplexity_insights: string
          target_audience: Json
          user_id: string | null
        }
        Insert: {
          buying_stage: string
          citations: string[]
          competitive_advantages: Json
          created_at?: string
          id?: string
          image_url: string
          intent_summary: string
          key_features: Json
          keywords?: Json[] | null
          new_headlines?: Json[] | null
          original_headlines?: Json[] | null
          pain_points: Json
          perplexity_insights: string
          target_audience: Json
          user_id?: string | null
        }
        Update: {
          buying_stage?: string
          citations?: string[]
          competitive_advantages?: Json
          created_at?: string
          id?: string
          image_url?: string
          intent_summary?: string
          key_features?: Json
          keywords?: Json[] | null
          new_headlines?: Json[] | null
          original_headlines?: Json[] | null
          pain_points?: Json
          perplexity_insights?: string
          target_audience?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      markets_overview: {
        Row: {
          created_at: string
          id: string
          insights: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insights?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insights?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      semrush_keywords: {
        Row: {
          competition: number | null
          cpc: number | null
          id: string
          keyword: string
          keyword_difficulty: number | null
          keyword_intents: string[] | null
          number_of_results: number | null
          position: number | null
          position_type: string | null
          previous_position: number | null
          search_volume: number | null
          serp_features: string[] | null
          timestamp: string | null
          traffic: number | null
          traffic_cost: number | null
          traffic_percentage: number | null
          trends: number[] | null
          url: string | null
        }
        Insert: {
          competition?: number | null
          cpc?: number | null
          id?: string
          keyword: string
          keyword_difficulty?: number | null
          keyword_intents?: string[] | null
          number_of_results?: number | null
          position?: number | null
          position_type?: string | null
          previous_position?: number | null
          search_volume?: number | null
          serp_features?: string[] | null
          timestamp?: string | null
          traffic?: number | null
          traffic_cost?: number | null
          traffic_percentage?: number | null
          trends?: number[] | null
          url?: string | null
        }
        Update: {
          competition?: number | null
          cpc?: number | null
          id?: string
          keyword?: string
          keyword_difficulty?: number | null
          keyword_intents?: string[] | null
          number_of_results?: number | null
          position?: number | null
          position_type?: string | null
          previous_position?: number | null
          search_volume?: number | null
          serp_features?: string[] | null
          timestamp?: string | null
          traffic?: number | null
          traffic_cost?: number | null
          traffic_percentage?: number | null
          trends?: number[] | null
          url?: string | null
        }
        Relationships: []
      }
      sentiment_analysis: {
        Row: {
          ad_output_id: string
          confidence: number
          id: string
          tone: string
          user: string | null
        }
        Insert: {
          ad_output_id: string
          confidence: number
          id?: string
          tone: string
          user?: string | null
        }
        Update: {
          ad_output_id?: string
          confidence?: number
          id?: string
          tone?: string
          user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_analysis_ad_output_id_fkey"
            columns: ["ad_output_id"]
            isOneToOne: false
            referencedRelation: "ad_structured_output"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          error: string | null
          id: string
          meta: Json | null
          result: Json | null
          status: Database["public"]["Enums"]["task_status"]
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json | null
          result?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json | null
          result?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_frames_mapping: {
        Row: {
          created_at: string | null
          frame_id: string
          frame_number: number
          id: string
          user_id: string | null
          video_id: string
          video_timestamp: unknown
        }
        Insert: {
          created_at?: string | null
          frame_id: string
          frame_number: number
          id?: string
          user_id?: string | null
          video_id: string
          video_timestamp: unknown
        }
        Update: {
          created_at?: string | null
          frame_id?: string
          frame_number?: number
          id?: string
          user_id?: string | null
          video_id?: string
          video_timestamp?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "video_frames_mapping_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "ad_structured_output"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_frames_mapping_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          mappings: string[] | null
          name: string
          user_id: string | null
          video_url: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          mappings?: string[] | null
          name: string
          user_id?: string | null
          video_url: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          mappings?: string[] | null
          name?: string
          user_id?: string | null
          video_url?: string
        }
        Relationships: []
      }
      visual_attributes: {
        Row: {
          attribute: string
          feature_id: string
          id: string
          value: string
        }
        Insert: {
          attribute: string
          feature_id: string
          id?: string
          value: string
        }
        Update: {
          attribute?: string
          feature_id?: string
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_attributes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      enhanced_ad_metrics_by_campaign: {
        Row: {
          avg_conversion_rate: number | null
          avg_ctr: number | null
          avg_roas: number | null
          campaign_id: string | null
          cost_per_conversion: number | null
          total_clicks: number | null
          total_conversions: number | null
          total_cost: number | null
          total_impressions: number | null
        }
        Relationships: []
      }
      enhanced_ad_metrics_by_channel: {
        Row: {
          avg_conversion_rate: number | null
          avg_cpc: number | null
          avg_cpm: number | null
          avg_ctr: number | null
          channel: string | null
          date: string | null
          total_clicks: number | null
          total_conversions: number | null
          total_cost: number | null
          total_impressions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fetch_library_items: {
        Args: {
          user_id: string
        }
        Returns: {
          id: string
          type: string
          name: string
          image_url: string
          image_description: string
          features: Json
          sentiment_analysis: Json
          created_at: string
        }[]
      }
      join_market_research_and_library_items: {
        Args: Record<PropertyKey, never>
        Returns: {
          mr_id: string
          mr_user_id: string
          mr_image_url: string
          mr_created_at: string
          mr_intent_summary: string
          mr_target_audience: Json
          mr_pain_points: Json
          mr_buying_stage: string
          mr_key_features: Json
          mr_competitive_advantages: Json
          mr_perplexity_insights: string
          mr_citations: string[]
          mr_keywords: Json[]
          mr_original_headlines: Json[]
          mr_new_headlines: Json[]
          li_id: string
          li_type: Database["public"]["Enums"]["library_item_type"]
          li_name: string
          li_description: string
          li_user_id: string
          li_created_at: string
          li_item_id: string
          li_features: string[]
          li_sentiment_tones: string[]
          li_avg_sentiment_confidence: number
          li_preview_url: string
        }[]
      }
      match_ad_descriptions:
        | {
            Args: {
              query_embedding: string
              match_threshold: number
              match_count: number
            }
            Returns: {
              id: string
              name: string
              image_url: string
              image_description: string
              similarity: number
            }[]
          }
        | {
            Args: {
              query_embedding: string
              match_threshold: number
              match_count: number
              user_id: string
            }
            Returns: {
              id: string
              name: string
              image_url: string
              image_description: string
              similarity: number
            }[]
          }
      match_ads: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      library_item_type: "image" | "video"
      task_status: "pending" | "processing" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

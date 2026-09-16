// TypeScript types that mirror the Supabase database schema.
// Update these whenever you change schema.sql.
// The Database interface matches the shape expected by @supabase/supabase-js v2.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// -------------------------------------------------------------------
// Row types — what comes back from SELECT queries
// -------------------------------------------------------------------

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  initials: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_archived: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  user_id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  sort_order: number;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  project_id: string | null;
  folder_id: string | null;
  title: string;
  recording_mode: 'lecture' | 'standard' | 'discussion';
  language: string;
  status: 'draft' | 'recording' | 'transcribing' | 'processing' | 'review' | 'completed' | 'failed';
  duration_seconds: number | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceFile {
  id: string;
  user_id: string;
  session_id: string;
  file_type: 'audio' | 'photo' | 'pdf';
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  retention_policy: 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently';
  scheduled_deletion_at: string | null;
  is_deleted: boolean;
  storage_path: string | null;
  is_uploaded: boolean;
  created_at: string;
}

export interface Transcript {
  id: string;
  user_id: string;
  session_id: string;
  language: string;
  full_text: string;
  segments: Json | null;
  confidence_score: number | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  summary_level: 'minimal' | 'standard' | 'extra';
  summary: string | null;
  key_concepts: Json;
  formulas: Json;
  definitions: Json;
  tags: string[];
  unclear_parts: Json;
  manual_annotations: string | null;
  is_confirmed: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiUsage {
  id: string;
  user_id: string;
  session_id: string | null;
  operation: 'transcription' | 'summarization' | 'ocr' | 'photo_analysis';
  tokens_input: number;
  tokens_output: number;
  audio_seconds: number;
  estimated_cost_usd: number;
  model_used: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  default_recording_mode: string;
  lecture_mode_default: boolean;
  default_summary_level: string;
  auto_title: boolean;
  auto_tags: boolean;
  include_unclear_parts: boolean;
  include_formulas: boolean;
  include_definitions: boolean;
  default_retention_policy: string;
  default_language: string;
  /** User-reported amount deposited with OpenAI (USD). */
  openai_budget: number;
  /** User-reported amount deposited with Anthropic (USD). */
  anthropic_budget: number;
  created_at: string;
  updated_at: string;
}

// -------------------------------------------------------------------
// Search result — used by search.service.ts
// -------------------------------------------------------------------

export type SearchResult = {
  id: string;
  type: 'project' | 'session' | 'note';
  title: string;
  subtitle?: string;
};

// -------------------------------------------------------------------
// Supabase v2 Database type
// Must include Views, Functions, Enums, CompositeTypes for the generic
// to resolve correctly.
// -------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          initials: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          initials?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          is_archived?: boolean;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          is_archived?: boolean;
          is_deleted?: boolean;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: Folder;
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          parent_folder_id?: string | null;
          name: string;
          sort_order?: number;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          parent_folder_id?: string | null;
          sort_order?: number;
          is_deleted?: boolean;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: Session;
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          folder_id?: string | null;
          title: string;
          recording_mode?: 'lecture' | 'standard' | 'discussion';
          language?: string;
          status?: 'draft' | 'recording' | 'transcribing' | 'processing' | 'review' | 'completed' | 'failed';
          duration_seconds?: number | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_id?: string | null;
          folder_id?: string | null;
          title?: string;
          recording_mode?: 'lecture' | 'standard' | 'discussion';
          language?: string;
          status?: 'draft' | 'recording' | 'transcribing' | 'processing' | 'review' | 'completed' | 'failed';
          duration_seconds?: number | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      source_files: {
        Row: SourceFile;
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          file_type: 'audio' | 'photo' | 'pdf';
          file_path: string;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          retention_policy?: 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently';
          scheduled_deletion_at?: string | null;
          is_deleted?: boolean;
          storage_path?: string | null;
          is_uploaded?: boolean;
          created_at?: string;
        };
        Update: {
          retention_policy?: 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently';
          scheduled_deletion_at?: string | null;
          is_deleted?: boolean;
          storage_path?: string | null;
          is_uploaded?: boolean;
        };
        Relationships: [];
      };
      transcripts: {
        Row: Transcript;
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          language: string;
          full_text: string;
          segments?: Json | null;
          confidence_score?: number | null;
          created_at?: string;
        };
        Update: {
          full_text?: string;
          segments?: Json | null;
          confidence_score?: number | null;
        };
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          title: string;
          summary_level?: 'minimal' | 'standard' | 'extra';
          summary?: string | null;
          key_concepts?: Json;
          formulas?: Json;
          definitions?: Json;
          tags?: string[];
          unclear_parts?: Json;
          manual_annotations?: string | null;
          is_confirmed?: boolean;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          summary_level?: 'minimal' | 'standard' | 'extra';
          summary?: string | null;
          key_concepts?: Json;
          formulas?: Json;
          definitions?: Json;
          tags?: string[];
          unclear_parts?: Json;
          manual_annotations?: string | null;
          is_confirmed?: boolean;
          is_deleted?: boolean;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsage;
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          operation: 'transcription' | 'summarization' | 'ocr' | 'photo_analysis';
          tokens_input?: number;
          tokens_output?: number;
          audio_seconds?: number;
          estimated_cost_usd?: number;
          model_used?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: {
          user_id: string;
          default_recording_mode?: string;
          lecture_mode_default?: boolean;
          default_summary_level?: string;
          auto_title?: boolean;
          auto_tags?: boolean;
          include_unclear_parts?: boolean;
          include_formulas?: boolean;
          include_definitions?: boolean;
          default_retention_policy?: string;
          default_language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          default_recording_mode?: string;
          lecture_mode_default?: boolean;
          default_summary_level?: string;
          auto_title?: boolean;
          auto_tags?: boolean;
          include_unclear_parts?: boolean;
          include_formulas?: boolean;
          include_definitions?: boolean;
          default_retention_policy?: string;
          default_language?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

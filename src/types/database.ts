// The app's own row types, which the services return and the screens use.
// Since step 1.7 they are mapped from the Supabase schema in
// src/lib/cloudRows.ts; the database's own types are src/types/supabase.ts.

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
  /** Path of the profile photo in the private `photos` bucket (step 1.4). */
  avatar_path: string | null;
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
  /** null = not starred. */
  starred_at: string | null;
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
  starred_at: string | null;
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
  starred_at: string | null;
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
  /** Name to show (a PDF's original file name), when known. */
  display_name?: string | null;
  /** A lecture's photo or PDF in Favorites (media.starred_at); null = not. */
  starred_at?: string | null;
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

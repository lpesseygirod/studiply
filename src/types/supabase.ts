
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_consent": {
                  Row: {
                    "created_at": string,"granted_at": string,"id": string,"policy_version": string,"scope": string,"user_id": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_at"?: string,"id"?: string,"policy_version": string,"scope": string,"user_id"?: string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"granted_at"?: string,"id"?: string,"policy_version"?: string,"scope"?: string,"user_id"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage": {
                  Row: {
                    "audio_seconds": number,"cost_usd": number,"created_at": string,"id": string,"lecture_id": string | null,"model": string,"operation": string,"provider": string,"tokens_input": number,"tokens_output": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_seconds"?: number,"cost_usd"?: number,"created_at"?: string,"id"?: string,"lecture_id"?: string | null,"model": string,"operation": string,"provider": string,"tokens_input"?: number,"tokens_output"?: number,"user_id": string
                  }
                  Update: {
                    "audio_seconds"?: number,"cost_usd"?: number,"created_at"?: string,"id"?: string,"lecture_id"?: string | null,"model"?: string,"operation"?: string,"provider"?: string,"tokens_input"?: number,"tokens_output"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"assistant_messages": {
                  Row: {
                    "asked_at_ms": number | null,"content": string,"created_at": string,"id": string,"lecture_id": string,"model": string | null,"quick_prompt": string | null,"reply_to": string | null,"role": string,"status": string,"updated_at": string,"user_id": string,"window_end_ms": number | null,"window_start_ms": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asked_at_ms"?: number | null,"content"?: string,"created_at"?: string,"id"?: string,"lecture_id": string,"model"?: string | null,"quick_prompt"?: string | null,"reply_to"?: string | null,"role": string,"status"?: string,"updated_at"?: string,"user_id"?: string,"window_end_ms"?: number | null,"window_start_ms"?: number | null
                  }
                  Update: {
                    "asked_at_ms"?: number | null,"content"?: string,"created_at"?: string,"id"?: string,"lecture_id"?: string,"model"?: string | null,"quick_prompt"?: string | null,"reply_to"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"window_end_ms"?: number | null,"window_start_ms"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_messages_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "assistant_messages_reply_to_user_id_fkey"
      columns: ["reply_to","user_id"]
isOneToOne: false
      referencedRelation: "assistant_messages"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"audio_chunks": {
                  Row: {
                    "created_at": string,"duration_ms": number,"id": string,"lecture_id": string,"seq": number,"start_ms": number,"status": string,"storage_path": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_ms": number,"id"?: string,"lecture_id": string,"seq": number,"start_ms": number,"status"?: string,"storage_path"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"duration_ms"?: number,"id"?: string,"lecture_id"?: string,"seq"?: number,"start_ms"?: number,"status"?: string,"storage_path"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audio_chunks_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"course_settings": {
                  Row: {
                    "course_id": string,"created_at": string,"exam_date": string | null,"exam_format": string | null,"professor": string | null,"quiz_calculations": number,"quiz_count": number,"quiz_definitions": number,"quiz_detail": number,"quiz_difficulty": number,"quiz_exam_focus": number,"quiz_memory_understanding": number,"quiz_theory_practice": number,"quiz_traps": number,"quiz_weak_spots": number,"slider_depth": number,"slider_exam_focus": number,"slider_examples": number,"slider_extra_resources": number,"slider_follow_marks": number,"slider_language": number,"slider_length": number,"slider_self_test": number,"slider_starting_point": number,"slider_visuals": number,"subject_type": string | null,"summary_language": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"exam_date"?: string | null,"exam_format"?: string | null,"professor"?: string | null,"quiz_calculations"?: number,"quiz_count"?: number,"quiz_definitions"?: number,"quiz_detail"?: number,"quiz_difficulty"?: number,"quiz_exam_focus"?: number,"quiz_memory_understanding"?: number,"quiz_theory_practice"?: number,"quiz_traps"?: number,"quiz_weak_spots"?: number,"slider_depth"?: number,"slider_exam_focus"?: number,"slider_examples"?: number,"slider_extra_resources"?: number,"slider_follow_marks"?: number,"slider_language"?: number,"slider_length"?: number,"slider_self_test"?: number,"slider_starting_point"?: number,"slider_visuals"?: number,"subject_type"?: string | null,"summary_language"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"exam_date"?: string | null,"exam_format"?: string | null,"professor"?: string | null,"quiz_calculations"?: number,"quiz_count"?: number,"quiz_definitions"?: number,"quiz_detail"?: number,"quiz_difficulty"?: number,"quiz_exam_focus"?: number,"quiz_memory_understanding"?: number,"quiz_theory_practice"?: number,"quiz_traps"?: number,"quiz_weak_spots"?: number,"slider_depth"?: number,"slider_exam_focus"?: number,"slider_examples"?: number,"slider_extra_resources"?: number,"slider_follow_marks"?: number,"slider_language"?: number,"slider_length"?: number,"slider_self_test"?: number,"slider_starting_point"?: number,"slider_visuals"?: number,"subject_type"?: string | null,"summary_language"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_settings_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "changed_at": string,"color": string,"created_at": string,"deleted_at": string | null,"icon": string,"id": string,"is_archived": boolean,"name": string,"sort_order": number,"starred_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"color"?: string,"created_at"?: string,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"is_archived"?: boolean,"name": string,"sort_order"?: number,"starred_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "changed_at"?: string,"color"?: string,"created_at"?: string,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"is_archived"?: boolean,"name"?: string,"sort_order"?: number,"starred_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"document_versions": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"document_id": string | null,"file_id": string | null,"id": string,"name": string | null,"reason": string,"summary_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"created_at"?: string,"document_id"?: string | null,"file_id"?: string | null,"id"?: string,"name"?: string | null,"reason": string,"summary_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"document_id"?: string | null,"file_id"?: string | null,"id"?: string,"name"?: string | null,"reason"?: string,"summary_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_versions_document_id_user_id_fkey"
      columns: ["document_id","user_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "document_versions_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "document_versions_summary_id_user_id_fkey"
      columns: ["summary_id","user_id"]
isOneToOne: false
      referencedRelation: "summaries"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"deleted_at": string | null,"file_id": string,"id": string,"kind": string | null,"page_setup": Json | null,"position": number | null,"tab": string,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"file_id": string,"id"?: string,"kind"?: string | null,"page_setup"?: Json | null,"position"?: number | null,"tab": string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"file_id"?: string,"id"?: string,"kind"?: string | null,"page_setup"?: Json | null,"position"?: number | null,"tab"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"files": {
                  Row: {
                    "changed_at": string,"course_id": string | null,"created_at": string,"deleted_at": string | null,"folder_id": string | null,"id": string,"kind": string,"last_opened_at": string | null,"past_exam_format": Json | null,"sort_order": number,"starred_at": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"folder_id"?: string | null,"id"?: string,"kind": string,"last_opened_at"?: string | null,"past_exam_format"?: Json | null,"sort_order"?: number,"starred_at"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "changed_at"?: string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"folder_id"?: string | null,"id"?: string,"kind"?: string,"last_opened_at"?: string | null,"past_exam_format"?: Json | null,"sort_order"?: number,"starred_at"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "files_folder_id_user_id_fkey"
      columns: ["folder_id","user_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"flashcards": {
                  Row: {
                    "back": string,"course_id": string | null,"created_at": string,"deleted_at": string | null,"file_id": string | null,"front": string,"id": string,"kind": string | null,"source": string,"source_ref": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "back": string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"file_id"?: string | null,"front": string,"id"?: string,"kind"?: string | null,"source": string,"source_ref"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "back"?: string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"file_id"?: string | null,"front"?: string,"id"?: string,"kind"?: string | null,"source"?: string,"source_ref"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flashcards_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "flashcards_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"folders": {
                  Row: {
                    "changed_at": string,"course_id": string | null,"created_at": string,"deleted_at": string | null,"id": string,"name": string,"parent_id": string | null,"sort_order": number,"starred_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"parent_id"?: string | null,"sort_order"?: number,"starred_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "changed_at"?: string,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"parent_id"?: string | null,"sort_order"?: number,"starred_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "folders_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "folders_parent_id_user_id_fkey"
      columns: ["parent_id","user_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"lectures": {
                  Row: {
                    "audio_delete_after": string | null,"audio_retention": string,"avg_confidence": number | null,"created_at": string,"duration_ms": number | null,"id": string,"language": string | null,"lecture_number": number | null,"recorded_at": string | null,"status": string,"transcript_quality": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_delete_after"?: string | null,"audio_retention"?: string,"avg_confidence"?: number | null,"created_at"?: string,"duration_ms"?: number | null,"id": string,"language"?: string | null,"lecture_number"?: number | null,"recorded_at"?: string | null,"status"?: string,"transcript_quality"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "audio_delete_after"?: string | null,"audio_retention"?: string,"avg_confidence"?: number | null,"created_at"?: string,"duration_ms"?: number | null,"id"?: string,"language"?: string | null,"lecture_number"?: number | null,"recorded_at"?: string | null,"status"?: string,"transcript_quality"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lectures_id_user_id_fkey"
      columns: ["id","user_id"]
isOneToOne: true
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"marks": {
                  Row: {
                    "created_at": string,"id": string,"lecture_id": string,"level": number,"note": string | null,"t_ms": number,"type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"lecture_id": string,"level": number,"note"?: string | null,"t_ms": number,"type": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"lecture_id"?: string,"level"?: number,"note"?: string | null,"t_ms"?: number,"type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marks_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"media": {
                  Row: {
                    "alt_text": string | null,"caption": string | null,"changed_at": string,"created_at": string,"extracted_text": string | null,"file_id": string | null,"id": string,"kind": string,"lecture_id": string | null,"mime_type": string | null,"page_count": number | null,"size_bytes": number | null,"starred_at": string | null,"storage_path": string | null,"t_ms": number | null,"updated_at": string,"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"caption"?: string | null,"changed_at"?: string,"created_at"?: string,"extracted_text"?: string | null,"file_id"?: string | null,"id"?: string,"kind": string,"lecture_id"?: string | null,"mime_type"?: string | null,"page_count"?: number | null,"size_bytes"?: number | null,"starred_at"?: string | null,"storage_path"?: string | null,"t_ms"?: number | null,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "alt_text"?: string | null,"caption"?: string | null,"changed_at"?: string,"created_at"?: string,"extracted_text"?: string | null,"file_id"?: string | null,"id"?: string,"kind"?: string,"lecture_id"?: string | null,"mime_type"?: string | null,"page_count"?: number | null,"size_bytes"?: number | null,"starred_at"?: string | null,"storage_path"?: string | null,"t_ms"?: number | null,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "media_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"note_lines": {
                  Row: {
                    "block_id": string,"content": Json | null,"created_at": string,"document_id": string,"id": string,"lecture_id": string,"position": number,"t_ms": number | null,"text": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"content"?: Json | null,"created_at"?: string,"document_id": string,"id"?: string,"lecture_id": string,"position": number,"t_ms"?: number | null,"text"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "block_id"?: string,"content"?: Json | null,"created_at"?: string,"document_id"?: string,"id"?: string,"lecture_id"?: string,"position"?: number,"t_ms"?: number | null,"text"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "note_lines_document_id_user_id_fkey"
      columns: ["document_id","user_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "note_lines_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"default_language": string,"display_name": string | null,"id": string,"initials": string | null,"pdf_paper_size": string,"preferences": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"default_language"?: string,"display_name"?: string | null,"id": string,"initials"?: string | null,"pdf_paper_size"?: string,"preferences"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"default_language"?: string,"display_name"?: string | null,"id"?: string,"initials"?: string | null,"pdf_paper_size"?: string,"preferences"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quiz_answers": {
                  Row: {
                    "answered_at": string,"attempt_id": string,"created_at": string,"graded_by": string | null,"hint_used": boolean,"id": string,"original_verdict": string | null,"points": number,"question_id": string,"reason": string,"response": NonNullable<Json>,"time_ms": number | null,"updated_at": string,"user_id": string,"verdict": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string,"attempt_id": string,"created_at"?: string,"graded_by"?: string | null,"hint_used"?: boolean,"id"?: string,"original_verdict"?: string | null,"points"?: number,"question_id": string,"reason"?: string,"response"?: NonNullable<Json>,"time_ms"?: number | null,"updated_at"?: string,"user_id"?: string,"verdict"?: string
                  }
                  Update: {
                    "answered_at"?: string,"attempt_id"?: string,"created_at"?: string,"graded_by"?: string | null,"hint_used"?: boolean,"id"?: string,"original_verdict"?: string | null,"points"?: number,"question_id"?: string,"reason"?: string,"response"?: NonNullable<Json>,"time_ms"?: number | null,"updated_at"?: string,"user_id"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_answers_attempt_id_user_id_fkey"
      columns: ["attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "quiz_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "quiz_answers_question_id_user_id_fkey"
      columns: ["question_id","user_id"]
isOneToOne: false
      referencedRelation: "quiz_questions"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"quiz_attempts": {
                  Row: {
                    "created_at": string,"duration_ms": number | null,"finished_at": string | null,"grading": string,"id": string,"max_points": number,"pass_threshold": number,"passed": boolean | null,"points": number,"quiz_id": string,"score": number,"started_at": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_ms"?: number | null,"finished_at"?: string | null,"grading"?: string,"id"?: string,"max_points"?: number,"pass_threshold"?: number,"passed"?: boolean | null,"points"?: number,"quiz_id": string,"score"?: number,"started_at"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"duration_ms"?: number | null,"finished_at"?: string | null,"grading"?: string,"id"?: string,"max_points"?: number,"pass_threshold"?: number,"passed"?: boolean | null,"points"?: number,"quiz_id"?: string,"score"?: number,"started_at"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_attempts_quiz_id_user_id_fkey"
      columns: ["quiz_id","user_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"quiz_questions": {
                  Row: {
                    "added_context": string,"answer_text": string,"created_at": string,"data": NonNullable<Json>,"difficulty": string,"explanation": string,"focus": string,"from_question_id": string | null,"hint": string,"id": string,"mark_id": string | null,"position": number,"prompt": string,"quiz_id": string,"source_file_id": string | null,"source_ms": number | null,"source_page": number | null,"type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_context"?: string,"answer_text"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"difficulty"?: string,"explanation"?: string,"focus"?: string,"from_question_id"?: string | null,"hint"?: string,"id"?: string,"mark_id"?: string | null,"position": number,"prompt": string,"quiz_id": string,"source_file_id"?: string | null,"source_ms"?: number | null,"source_page"?: number | null,"type": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "added_context"?: string,"answer_text"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"difficulty"?: string,"explanation"?: string,"focus"?: string,"from_question_id"?: string | null,"hint"?: string,"id"?: string,"mark_id"?: string | null,"position"?: number,"prompt"?: string,"quiz_id"?: string,"source_file_id"?: string | null,"source_ms"?: number | null,"source_page"?: number | null,"type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_questions_from_question_id_user_id_fkey"
      columns: ["from_question_id","user_id"]
isOneToOne: false
      referencedRelation: "quiz_questions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "quiz_questions_quiz_id_user_id_fkey"
      columns: ["quiz_id","user_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "quiz_questions_source_file_id_user_id_fkey"
      columns: ["source_file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"quiz_sources": {
                  Row: {
                    "created_at": string,"file_id": string | null,"id": string,"position": number,"quiz_id": string,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_id"?: string | null,"id"?: string,"position"?: number,"quiz_id": string,"role": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"file_id"?: string | null,"id"?: string,"position"?: number,"quiz_id"?: string,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_sources_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "quiz_sources_quiz_id_user_id_fkey"
      columns: ["quiz_id","user_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"quizzes": {
                  Row: {
                    "checks": Json | null,"course_id": string | null,"created_at": string,"deleted_at": string | null,"error": string | null,"id": string,"language": string | null,"plan": NonNullable<Json>,"question_count": number,"settings": NonNullable<Json>,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checks"?: Json | null,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"error"?: string | null,"id"?: string,"language"?: string | null,"plan": NonNullable<Json>,"question_count"?: number,"settings": NonNullable<Json>,"status"?: string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checks"?: Json | null,"course_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"error"?: string | null,"id"?: string,"language"?: string | null,"plan"?: NonNullable<Json>,"question_count"?: number,"settings"?: NonNullable<Json>,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quizzes_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"review_schedule": {
                  Row: {
                    "created_at": string,"due_at": string,"ease": number,"file_id": string | null,"flashcard_id": string | null,"id": string,"interval_days": number,"last_grade": string | null,"last_reviewed_at": string | null,"reps": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"due_at": string,"ease"?: number,"file_id"?: string | null,"flashcard_id"?: string | null,"id"?: string,"interval_days"?: number,"last_grade"?: string | null,"last_reviewed_at"?: string | null,"reps"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"due_at"?: string,"ease"?: number,"file_id"?: string | null,"flashcard_id"?: string | null,"id"?: string,"interval_days"?: number,"last_grade"?: string | null,"last_reviewed_at"?: string | null,"reps"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_schedule_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "review_schedule_flashcard_id_user_id_fkey"
      columns: ["flashcard_id","user_id"]
isOneToOne: false
      referencedRelation: "flashcards"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"summaries": {
                  Row: {
                    "applied_settings": Json | null,"created_at": string,"error": string | null,"file_id": string,"id": string,"marks_total": number | null,"marks_used": number | null,"mode": string,"model": string | null,"note_lines_total": number | null,"note_lines_used": number | null,"result": Json | null,"sliders": NonNullable<Json>,"source_lecture_ids": (string)[],"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_settings"?: Json | null,"created_at"?: string,"error"?: string | null,"file_id": string,"id"?: string,"marks_total"?: number | null,"marks_used"?: number | null,"mode": string,"model"?: string | null,"note_lines_total"?: number | null,"note_lines_used"?: number | null,"result"?: Json | null,"sliders": NonNullable<Json>,"source_lecture_ids"?: (string)[],"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "applied_settings"?: Json | null,"created_at"?: string,"error"?: string | null,"file_id"?: string,"id"?: string,"marks_total"?: number | null,"marks_used"?: number | null,"mode"?: string,"model"?: string | null,"note_lines_total"?: number | null,"note_lines_used"?: number | null,"result"?: Json | null,"sliders"?: NonNullable<Json>,"source_lecture_ids"?: (string)[],"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "summaries_file_id_user_id_fkey"
      columns: ["file_id","user_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"terms_acceptances": {
                  Row: {
                    "accepted_at": string,"age_confirmed": boolean,"id": string,"source": string,"terms_version": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"age_confirmed": boolean,"id"?: string,"source": string,"terms_version": string,"user_id"?: string
                  }
                  Update: {
                    "accepted_at"?: string,"age_confirmed"?: boolean,"id"?: string,"source"?: string,"terms_version"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"transcript_segments": {
                  Row: {
                    "chunk_id": string | null,"confidence": number | null,"created_at": string,"end_ms": number,"id": string,"lecture_id": string,"start_ms": number,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"end_ms": number,"id"?: string,"lecture_id": string,"start_ms": number,"text": string,"user_id"?: string
                  }
                  Update: {
                    "chunk_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"end_ms"?: number,"id"?: string,"lecture_id"?: string,"start_ms"?: number,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transcript_segments_chunk_id_user_id_fkey"
      columns: ["chunk_id","user_id"]
isOneToOne: false
      referencedRelation: "audio_chunks"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transcript_segments_lecture_id_user_id_fkey"
      columns: ["lecture_id","user_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "account_storage_objects":
{ Args: { "uid": string }; Returns: {
              "bucket_id": string,"name": string
            }[]
                           },
"review_card":
{ Args: { "p_due_at": string,"p_ease": number,"p_flashcard_id": string,"p_grade": string,"p_interval_days": number,"p_reps": number,"p_reviewed_at": string }; Returns: boolean
                           },
"search_library":
{ Args: { "max_results"?: number,"q": string }; Returns: {
              "course_color": string,"course_id": string,"course_name": string,"field": string,"file_kind": string,"folder_id": string,"item_id": string,"kind": string,"matched": string,"rank": number,"t_ms": number,"title": string
            }[]
                           },
"trash_purge":
{ Args: { "older_than": string }; Returns: {
              "courses": number,"files": number,"folders": number
            }[]
                           },
"trash_purge_plan":
{ Args: { "older_than": string }; Returns: {
              "bucket": string,"path": string
            }[]
                           },
"withdraw_ai_consent":
{ Args: Record<PropertyKey, never>; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

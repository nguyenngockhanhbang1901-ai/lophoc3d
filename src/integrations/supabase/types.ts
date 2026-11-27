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
  public: {
    Tables: {
      classroom_teams: {
        Row: {
          access_hash: string
          activity3_answers: Json
          activity3_completed_at: string | null
          activity3_step: number
          answers: Json
          classroom_id: string
          goal_answers: Json
          goal_completed_at: string | null
          goal_revision: number
          goal_step: number
          goal_timings: Json
          id: string
          number: number
          photo_answers: Json
          photo_completed_at: string | null
          photo_step: number
          practice_answers: Json
          practice_completed_at: string | null
          practice_revision: number
          practice_step: number
          practice_timings: Json
          quiz_answers: Json
          quiz_completed_at: string | null
          quiz_revision: number
          quiz_step: number
          quiz_timings: Json
          step: number
          submitted_at: string | null
          timings: Json
        }
        Insert: {
          access_hash: string
          activity3_answers?: Json
          activity3_completed_at?: string | null
          activity3_step?: number
          answers?: Json
          classroom_id: string
          goal_answers?: Json
          goal_completed_at?: string | null
          goal_revision?: number
          goal_step?: number
          goal_timings?: Json
          id?: string
          number: number
          photo_answers?: Json
          photo_completed_at?: string | null
          photo_step?: number
          practice_answers?: Json
          practice_completed_at?: string | null
          practice_revision?: number
          practice_step?: number
          practice_timings?: Json
          quiz_answers?: Json
          quiz_completed_at?: string | null
          quiz_revision?: number
          quiz_step?: number
          quiz_timings?: Json
          step?: number
          submitted_at?: string | null
          timings?: Json
        }
        Update: {
          access_hash?: string
          activity3_answers?: Json
          activity3_completed_at?: string | null
          activity3_step?: number
          answers?: Json
          classroom_id?: string
          goal_answers?: Json
          goal_completed_at?: string | null
          goal_revision?: number
          goal_step?: number
          goal_timings?: Json
          id?: string
          number?: number
          photo_answers?: Json
          photo_completed_at?: string | null
          photo_step?: number
          practice_answers?: Json
          practice_completed_at?: string | null
          practice_revision?: number
          practice_step?: number
          practice_timings?: Json
          quiz_answers?: Json
          quiz_completed_at?: string | null
          quiz_revision?: number
          quiz_step?: number
          quiz_timings?: Json
          step?: number
          submitted_at?: string | null
          timings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "classroom_teams_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          activity1_answers_visible: boolean
          activity2_started_at: string | null
          activity3_answers_visible: boolean
          activity3_started_at: string | null
          answers_visible: boolean
          closed: boolean
          code: string
          correct_visible: boolean
          created_at: string
          current_activity: number
          current_step: number
          id: string
          lesson_content: Json
          lesson_key: string
          lesson_mode: string
          lesson_title: string
          owner_id: string
          photo_answers_visible: boolean
          photo_started_at: string | null
          practice1_answers_visible: boolean
          practice1_started_at: string | null
          presentation_review: boolean
          presentation_step: number
          quiz_answers_visible: boolean
          quiz_started_at: string | null
          started_at: string | null
          team_count: number
          title: string
        }
        Insert: {
          activity1_answers_visible?: boolean
          activity2_started_at?: string | null
          activity3_answers_visible?: boolean
          activity3_started_at?: string | null
          answers_visible?: boolean
          closed?: boolean
          code: string
          correct_visible?: boolean
          created_at?: string
          current_activity?: number
          current_step?: number
          id?: string
          lesson_content?: Json
          lesson_key?: string
          lesson_mode?: string
          lesson_title?: string
          owner_id: string
          photo_answers_visible?: boolean
          photo_started_at?: string | null
          practice1_answers_visible?: boolean
          practice1_started_at?: string | null
          presentation_review?: boolean
          presentation_step?: number
          quiz_answers_visible?: boolean
          quiz_started_at?: string | null
          started_at?: string | null
          team_count: number
          title: string
        }
        Update: {
          activity1_answers_visible?: boolean
          activity2_started_at?: string | null
          activity3_answers_visible?: boolean
          activity3_started_at?: string | null
          answers_visible?: boolean
          closed?: boolean
          code?: string
          correct_visible?: boolean
          created_at?: string
          current_activity?: number
          current_step?: number
          id?: string
          lesson_content?: Json
          lesson_key?: string
          lesson_mode?: string
          lesson_title?: string
          owner_id?: string
          photo_answers_visible?: boolean
          photo_started_at?: string | null
          practice1_answers_visible?: boolean
          practice1_started_at?: string | null
          presentation_review?: boolean
          presentation_step?: number
          quiz_answers_visible?: boolean
          quiz_started_at?: string | null
          started_at?: string | null
          team_count?: number
          title?: string
        }
        Relationships: []
      }
      exam_answer_events: {
        Row: {
          answer: Json
          at: string
          attempt_id: string
          id: number
          item_index: number
        }
        Insert: {
          answer: Json
          at?: string
          attempt_id: string
          id?: never
          item_index: number
        }
        Update: {
          answer?: Json
          at?: string
          attempt_id?: string
          id?: never
          item_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_answer_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          answer: Json
          answer_at_completion: Json | null
          attempt_id: string
          item_index: number
          updated_at: string
        }
        Insert: {
          answer: Json
          answer_at_completion?: Json | null
          attempt_id: string
          item_index: number
          updated_at?: string
        }
        Update: {
          answer?: Json
          answer_at_completion?: Json | null
          attempt_id?: string
          item_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_assignments: {
        Row: {
          class_id: string
          closes_at: string
          created_at: string
          duration_minutes: number
          id: string
          matrix_id: string | null
          max_attempts: number
          opens_at: string
          owner_id: string
          settings: Json
          shuffle_options: boolean
          shuffle_order: boolean
          slots: Json
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          closes_at: string
          created_at?: string
          duration_minutes: number
          id?: string
          matrix_id?: string | null
          max_attempts?: number
          opens_at: string
          owner_id?: string
          settings?: Json
          shuffle_options?: boolean
          shuffle_order?: boolean
          slots: Json
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          closes_at?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          matrix_id?: string | null
          max_attempts?: number
          opens_at?: string
          owner_id?: string
          settings?: Json
          shuffle_options?: boolean
          shuffle_order?: boolean
          slots?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "exam_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_assignments_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "exam_matrices"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          assignment_id: string
          attempt_no: number
          code: string
          completed_all_at: string | null
          correct_count: number | null
          counts_toward_attempts: boolean
          created_at: string
          deadline_at: string
          disconnect_count: number
          edit_count: number
          edit_warned_at: string | null
          finished_at: string | null
          id: string
          items: Json
          last_heartbeat_at: string | null
          owner_id: string
          reached_index: number
          results: Json | null
          rules_accepted_at: string
          score: number | null
          session_hash: string | null
          started_at: string
          status: string
          student_id: string
          user_agent: string
          violation_count: number
        }
        Insert: {
          assignment_id: string
          attempt_no: number
          code: string
          completed_all_at?: string | null
          correct_count?: number | null
          counts_toward_attempts?: boolean
          created_at?: string
          deadline_at: string
          disconnect_count?: number
          edit_count?: number
          edit_warned_at?: string | null
          finished_at?: string | null
          id?: string
          items: Json
          last_heartbeat_at?: string | null
          owner_id: string
          reached_index?: number
          results?: Json | null
          rules_accepted_at: string
          score?: number | null
          session_hash?: string | null
          started_at?: string
          status?: string
          student_id: string
          user_agent?: string
          violation_count?: number
        }
        Update: {
          assignment_id?: string
          attempt_no?: number
          code?: string
          completed_all_at?: string | null
          correct_count?: number | null
          counts_toward_attempts?: boolean
          created_at?: string
          deadline_at?: string
          disconnect_count?: number
          edit_count?: number
          edit_warned_at?: string | null
          finished_at?: string | null
          id?: string
          items?: Json
          last_heartbeat_at?: string | null
          owner_id?: string
          reached_index?: number
          results?: Json | null
          rules_accepted_at?: string
          score?: number | null
          session_hash?: string | null
          started_at?: string
          status?: string
          student_id?: string
          user_agent?: string
          violation_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_banks: {
        Row: {
          created_at: string
          description: string
          id: string
          owner_id: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          title: string
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_classes: {
        Row: {
          archived: boolean
          created_at: string
          default_password_enc: string | null
          id: string
          name: string
          owner_id: string
          school_year: string
          subject: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          default_password_enc?: string | null
          id?: string
          name: string
          owner_id?: string
          school_year?: string
          subject?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          default_password_enc?: string | null
          id?: string
          name?: string
          owner_id?: string
          school_year?: string
          subject?: string
        }
        Relationships: []
      }
      exam_connection_events: {
        Row: {
          assignment_id: string
          attempt_id: string
          drop_number: number
          duration_ms: number
          ended_at: string
          id: number
          outcome: string
          owner_id: string
          started_at: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          attempt_id: string
          drop_number: number
          duration_ms: number
          ended_at: string
          id?: never
          outcome: string
          owner_id: string
          started_at: string
          student_id: string
        }
        Update: {
          assignment_id?: string
          attempt_id?: string
          drop_number?: number
          duration_ms?: number
          ended_at?: string
          id?: never
          outcome?: string
          owner_id?: string
          started_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_connection_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_connection_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_connection_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_lesson_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          lesson_key: string
          opens_at: string
          owner_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          lesson_key: string
          opens_at?: string
          owner_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          lesson_key?: string
          opens_at?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_lesson_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "exam_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_lesson_views: {
        Row: {
          first_opened_at: string
          last_opened_at: string
          lesson_assignment_id: string
          open_count: number
          owner_id: string
          student_id: string
        }
        Insert: {
          first_opened_at?: string
          last_opened_at?: string
          lesson_assignment_id: string
          open_count?: number
          owner_id: string
          student_id: string
        }
        Update: {
          first_opened_at?: string
          last_opened_at?: string
          lesson_assignment_id?: string
          open_count?: number
          owner_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_lesson_views_lesson_assignment_id_fkey"
            columns: ["lesson_assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_lesson_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_lesson_views_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_login_logs: {
        Row: {
          at: string
          id: string
          student_id: string | null
          success: boolean
          user_agent: string
          username: string
        }
        Insert: {
          at?: string
          id?: string
          student_id?: string | null
          success: boolean
          user_agent?: string
          username: string
        }
        Update: {
          at?: string
          id?: string
          student_id?: string | null
          success?: boolean
          user_agent?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_login_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_matrices: {
        Row: {
          created_at: string
          description: string
          id: string
          owner_id: string
          shuffle_options: boolean
          shuffle_order: boolean
          slots: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          shuffle_options?: boolean
          shuffle_order?: boolean
          slots?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          shuffle_options?: boolean
          shuffle_order?: boolean
          slots?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_notifications: {
        Row: {
          assignment_id: string | null
          body: string
          created_at: string
          id: number
          kind: string
          lesson_assignment_id: string | null
          owner_id: string
          read_at: string | null
          student_id: string
        }
        Insert: {
          assignment_id?: string | null
          body?: string
          created_at?: string
          id?: never
          kind: string
          lesson_assignment_id?: string | null
          owner_id: string
          read_at?: string | null
          student_id: string
        }
        Update: {
          assignment_id?: string | null
          body?: string
          created_at?: string
          id?: never
          kind?: string
          lesson_assignment_id?: string | null
          owner_id?: string
          read_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_notifications_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_notifications_lesson_assignment_id_fkey"
            columns: ["lesson_assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_lesson_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          bank_id: string
          body: Json
          created_at: string
          hidden: boolean
          id: string
          kind: string
          level: string
          owner_id: string
          position: number
          topic: string
          updated_at: string
        }
        Insert: {
          bank_id: string
          body: Json
          created_at?: string
          hidden?: boolean
          id?: string
          kind: string
          level?: string
          owner_id?: string
          position?: number
          topic?: string
          updated_at?: string
        }
        Update: {
          bank_id?: string
          body?: Json
          created_at?: string
          hidden?: boolean
          id?: string
          kind?: string
          level?: string
          owner_id?: string
          position?: number
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "exam_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_retake_grants: {
        Row: {
          assignment_id: string
          created_at: string
          expires_at: string | null
          id: string
          owner_id: string
          reason: string
          revoked_at: string | null
          student_id: string
          used_at: string | null
          used_attempt_id: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id: string
          reason?: string
          revoked_at?: string | null
          student_id: string
          used_at?: string | null
          used_attempt_id?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          reason?: string
          revoked_at?: string | null
          student_id?: string
          used_at?: string | null
          used_attempt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_retake_grants_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_retake_grants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_retake_grants_used_attempt_id_fkey"
            columns: ["used_attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_student_sessions: {
        Row: {
          created_at: string
          expires_at: string
          last_seen_at: string
          student_id: string
          token_hash: string
          user_agent: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          last_seen_at?: string
          student_id: string
          token_hash: string
          user_agent?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          last_seen_at?: string
          student_id?: string
          token_hash?: string
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_student_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "exam_students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_students: {
        Row: {
          birth_date: string | null
          class_id: string
          created_at: string
          full_name: string
          id: string
          locked: boolean
          owner_id: string
          password_by_student: boolean
          password_enc: string | null
          password_hash: string
          password_set_at: string
          student_code: string | null
          username: string
        }
        Insert: {
          birth_date?: string | null
          class_id: string
          created_at?: string
          full_name: string
          id?: string
          locked?: boolean
          owner_id: string
          password_by_student?: boolean
          password_enc?: string | null
          password_hash: string
          password_set_at?: string
          student_code?: string | null
          username: string
        }
        Update: {
          birth_date?: string | null
          class_id?: string
          created_at?: string
          full_name?: string
          id?: string
          locked?: boolean
          owner_id?: string
          password_by_student?: boolean
          password_enc?: string | null
          password_hash?: string
          password_set_at?: string
          student_code?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "exam_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_violations: {
        Row: {
          at: string
          attempt_id: string
          away_ms: number | null
          counted: boolean
          id: number
          kind: string
          owner_id: string
        }
        Insert: {
          at?: string
          attempt_id: string
          away_ms?: number | null
          counted?: boolean
          id?: never
          kind: string
          owner_id: string
        }
        Update: {
          at?: string
          attempt_id?: string
          away_ms?: number | null
          counted?: boolean
          id?: never
          kind?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_violations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_ai_prepared: {
        Row: {
          answer: string
          owner_id: string
          question_key: string
          updated_at: string
        }
        Insert: {
          answer: string
          owner_id?: string
          question_key: string
          updated_at?: string
        }
        Update: {
          answer?: string
          owner_id?: string
          question_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_ai_solutions: {
        Row: {
          answer: string
          classroom_id: string
          id: string
          question_key: string
          updated_at: string
        }
        Insert: {
          answer: string
          classroom_id: string
          id?: string
          question_key: string
          updated_at?: string
        }
        Update: {
          answer?: string
          classroom_id?: string
          id?: string
          question_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_ai_solutions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson111_students: {
        Row: {
          access_hash: string
          answers: Json
          classroom_id: string
          id: string
          name: string | null
          slot: number
          submitted_at: string | null
        }
        Insert: {
          access_hash: string
          answers?: Json
          classroom_id: string
          id?: string
          name?: string | null
          slot: number
          submitted_at?: string | null
        }
        Update: {
          access_hash?: string
          answers?: Json
          classroom_id?: string
          id?: string
          name?: string | null
          slot?: number
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson111_students_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          created_at: string
          id: string
          lesson_key: string
          owner_id: string
          title: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          lesson_key: string
          owner_id: string
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          lesson_key?: string
          owner_id?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_classroom_activity: {
        Args: { activity: number; room_id: string }
        Returns: string
      }
      begin_classroom_assignment: { Args: { room_id: string }; Returns: string }
      set_classroom_activity: {
        Args: { activity: number; room_id: string }
        Returns: number
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
    Enums: {},
  },
} as const

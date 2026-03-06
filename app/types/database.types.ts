export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          activity_id: number
          name: string
        }
        Insert: {
          activity_id?: number
          name: string
        }
        Update: {
          activity_id?: number
          name?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_id: number
          asset_type: string | null
          created_at: string
          floor_id: number | null
          location_id: number | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          room_id: number | null
          serial_number: string | null
          space_id: number
          updated_at: string
        }
        Insert: {
          asset_id?: never
          asset_type?: string | null
          created_at?: string
          floor_id?: number | null
          location_id?: number | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          room_id?: number | null
          serial_number?: string | null
          space_id: number
          updated_at?: string
        }
        Update: {
          asset_id?: never
          asset_type?: string | null
          created_at?: string
          floor_id?: number | null
          location_id?: number | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          room_id?: number | null
          serial_number?: string | null
          space_id?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "assets_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "assets_location_id_fkey"; columns: ["location_id"]; isOneToOne: false; referencedRelation: "locations"; referencedColumns: ["location_id"] },
          { foreignKeyName: "assets_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "assets_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      documents: {
        Row: {
          asset_id: number | null
          created_at: string
          document_id: number
          document_kind: string
          file_url: string | null
          floor_id: number | null
          location_id: number | null
          markdown_content: string | null
          mime_type: string | null
          room_id: number | null
          space_id: number | null
          storage_path: string | null
          task_id: number | null
          title: string | null
          updated_at: string
          uploaded_by_user_id: number | null
          user_id: number | null
        }
        Insert: {
          asset_id?: number | null
          created_at?: string
          document_id?: number
          document_kind?: string
          file_url?: string | null
          floor_id?: number | null
          location_id?: number | null
          markdown_content?: string | null
          mime_type?: string | null
          room_id?: number | null
          space_id?: number | null
          storage_path?: string | null
          task_id?: number | null
          title?: string | null
          updated_at?: string
          uploaded_by_user_id?: number | null
          user_id?: number | null
        }
        Update: {
          asset_id?: number | null
          created_at?: string
          document_id?: number
          document_kind?: string
          file_url?: string | null
          floor_id?: number | null
          location_id?: number | null
          markdown_content?: string | null
          mime_type?: string | null
          room_id?: number | null
          space_id?: number | null
          storage_path?: string | null
          task_id?: number | null
          title?: string | null
          updated_at?: string
          uploaded_by_user_id?: number | null
          user_id?: number | null
        }
        Relationships: [
          { foreignKeyName: "documents_asset_id_fkey"; columns: ["asset_id"]; isOneToOne: false; referencedRelation: "assets"; referencedColumns: ["asset_id"] },
          { foreignKeyName: "documents_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "documents_location_id_fkey"; columns: ["location_id"]; isOneToOne: false; referencedRelation: "locations"; referencedColumns: ["location_id"] },
          { foreignKeyName: "documents_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "documents_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
          { foreignKeyName: "documents_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["task_id"] },
          { foreignKeyName: "documents_uploaded_by_user_id_fkey"; columns: ["uploaded_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
          { foreignKeyName: "documents_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      event_tasks: {
        Row: {
          created_at: string
          event_id: number
          id: number
          task_id: number
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: never
          task_id: number
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: never
          task_id?: number
        }
        Relationships: [
          { foreignKeyName: "event_tasks_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["event_id"] },
          { foreignKeyName: "event_tasks_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["task_id"] },
        ]
      }
      events: {
        Row: {
          asset_id: number | null
          created_at: string
          created_by_user_id: number | null
          description: string | null
          ends_at: string
          event_id: number
          external_participants: string | null
          floor_id: number | null
          location_id: number | null
          notes: string | null
          room_id: number | null
          space_id: number
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: number | null
          created_at?: string
          created_by_user_id?: number | null
          description?: string | null
          ends_at: string
          event_id?: never
          external_participants?: string | null
          floor_id?: number | null
          location_id?: number | null
          notes?: string | null
          room_id?: number | null
          space_id: number
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: number | null
          created_at?: string
          created_by_user_id?: number | null
          description?: string | null
          ends_at?: string
          event_id?: never
          external_participants?: string | null
          floor_id?: number | null
          location_id?: number | null
          notes?: string | null
          room_id?: number | null
          space_id?: number
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "events_asset_id_fkey"; columns: ["asset_id"]; isOneToOne: false; referencedRelation: "assets"; referencedColumns: ["asset_id"] },
          { foreignKeyName: "events_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
          { foreignKeyName: "events_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "events_location_id_fkey"; columns: ["location_id"]; isOneToOne: false; referencedRelation: "locations"; referencedColumns: ["location_id"] },
          { foreignKeyName: "events_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "events_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      floors: {
        Row: {
          floor_id: number
          level_index: number | null
          matterport_floor_id: string | null
          name: string
          sequence: number | null
          space_id: number | null
          updated_at: string
        }
        Insert: {
          floor_id?: number
          level_index?: number | null
          matterport_floor_id?: string | null
          name: string
          sequence?: number | null
          space_id?: number | null
          updated_at?: string
        }
        Update: {
          floor_id?: number
          level_index?: number | null
          matterport_floor_id?: string | null
          name?: string
          sequence?: number | null
          space_id?: number | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "floors_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      list_tasks: {
        Row: { list_id: number; task_id: number }
        Insert: { list_id: number; task_id: number }
        Update: { list_id?: number; task_id?: number }
        Relationships: [
          { foreignKeyName: "list_tasks_list_id_fkey"; columns: ["list_id"]; isOneToOne: false; referencedRelation: "lists"; referencedColumns: ["list_id"] },
          { foreignKeyName: "list_tasks_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["task_id"] },
        ]
      }
      lists: {
        Row: {
          created_by_user_id: number | null
          description: string | null
          list_id: number
          name: string
          space_id: number | null
          updated_at: string
        }
        Insert: {
          created_by_user_id?: number | null
          description?: string | null
          list_id?: number
          name: string
          space_id?: number | null
          updated_at?: string
        }
        Update: {
          created_by_user_id?: number | null
          description?: string | null
          list_id?: number
          name?: string
          space_id?: number | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "lists_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
          { foreignKeyName: "lists_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      locations: {
        Row: {
          color: string | null
          description: string | null
          enabled: boolean | null
          floor_id: number | null
          location_id: number
          location_name: string | null
          matterport_tag_id: string | null
          room_id: number | null
          space_id: number | null
          updated_at: string
          x: number | null
          y: number | null
          z: number | null
        }
        Insert: {
          color?: string | null
          description?: string | null
          enabled?: boolean | null
          floor_id?: number | null
          location_id?: number
          location_name?: string | null
          matterport_tag_id?: string | null
          room_id?: number | null
          space_id?: number | null
          updated_at?: string
          x?: number | null
          y?: number | null
          z?: number | null
        }
        Update: {
          color?: string | null
          description?: string | null
          enabled?: boolean | null
          floor_id?: number | null
          location_id?: number
          location_name?: string | null
          matterport_tag_id?: string | null
          room_id?: number | null
          space_id?: number | null
          updated_at?: string
          x?: number | null
          y?: number | null
          z?: number | null
        }
        Relationships: [
          { foreignKeyName: "locations_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "locations_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "locations_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      menu_items: {
        Row: {
          enabled: boolean | null
          menu_items_id: number
          name: string | null
          order: number | null
          user_id: number | null
        }
        Insert: {
          enabled?: boolean | null
          menu_items_id?: number
          name?: string | null
          order?: number | null
          user_id?: number | null
        }
        Update: {
          enabled?: boolean | null
          menu_items_id?: number
          name?: string | null
          order?: number | null
          user_id?: number | null
        }
        Relationships: [
          { foreignKeyName: "menu_items_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          document_id: number | null
          event_id: number | null
          floor_id: number | null
          is_new: boolean | null
          location_id: number | null
          notification_id: number
          read_at: string | null
          room_id: number | null
          task_id: number | null
          title: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string
          document_id?: number | null
          event_id?: number | null
          floor_id?: number | null
          is_new?: boolean | null
          location_id?: number | null
          notification_id?: number
          read_at?: string | null
          room_id?: number | null
          task_id?: number | null
          title?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string
          document_id?: number | null
          event_id?: number | null
          floor_id?: number | null
          is_new?: boolean | null
          location_id?: number | null
          notification_id?: number
          read_at?: string | null
          room_id?: number | null
          task_id?: number | null
          title?: string | null
          user_id?: number | null
        }
        Relationships: [
          { foreignKeyName: "notifications_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "documents"; referencedColumns: ["document_id"] },
          { foreignKeyName: "notifications_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["event_id"] },
          { foreignKeyName: "notifications_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "notifications_location_id_fkey"; columns: ["location_id"]; isOneToOne: false; referencedRelation: "locations"; referencedColumns: ["location_id"] },
          { foreignKeyName: "notifications_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "notifications_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["task_id"] },
          { foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      reccuring: {
        Row: { name: string; reccuring_id: number }
        Insert: { name: string; reccuring_id?: number }
        Update: { name?: string; reccuring_id?: number }
        Relationships: []
      }
      rooms: {
        Row: {
          floor_id: number | null
          name: string
          room_id: number
          room_type: string | null
          space_id: number | null
          updated_at: string
        }
        Insert: {
          floor_id?: number | null
          name: string
          room_id?: number
          room_type?: string | null
          space_id?: number | null
          updated_at?: string
        }
        Update: {
          floor_id?: number | null
          name?: string
          room_id?: number
          room_type?: string | null
          space_id?: number | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "rooms_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "rooms_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
        ]
      }
      space_memberships: {
        Row: { created_at: string; id: number; role: string; space_id: number; user_id: number }
        Insert: { created_at?: string; id?: never; role?: string; space_id: number; user_id: number }
        Update: { created_at?: string; id?: never; role?: string; space_id?: number; user_id?: number }
        Relationships: [
          { foreignKeyName: "space_memberships_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
          { foreignKeyName: "space_memberships_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      spaces: {
        Row: {
          description: string | null
          name: string
          owner_user_id: number | null
          space_id: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          name: string
          owner_user_id?: number | null
          space_id?: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          name?: string
          owner_user_id?: number | null
          space_id?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "spaces_owner_user_id_fkey"; columns: ["owner_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      tasks: {
        Row: {
          activity_id: number | null
          asset_id: number | null
          assigned_user_id: number | null
          completed_at: string | null
          created_at: string
          created_by_user_id: number | null
          description: string | null
          due_at: string | null
          floor_id: number | null
          location_id: number | null
          reccuring_id: number | null
          recurrence_rule: string | null
          room_id: number | null
          space_id: number | null
          status: string | null
          task_id: number
          task_type: string | null
          title: string | null
          updated_at: string
          user_id: number | null
        }
        Insert: {
          activity_id?: number | null
          asset_id?: number | null
          assigned_user_id?: number | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: number | null
          description?: string | null
          due_at?: string | null
          floor_id?: number | null
          location_id?: number | null
          reccuring_id?: number | null
          recurrence_rule?: string | null
          room_id?: number | null
          space_id?: number | null
          status?: string | null
          task_id?: number
          task_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: number | null
        }
        Update: {
          activity_id?: number | null
          asset_id?: number | null
          assigned_user_id?: number | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: number | null
          description?: string | null
          due_at?: string | null
          floor_id?: number | null
          location_id?: number | null
          reccuring_id?: number | null
          recurrence_rule?: string | null
          room_id?: number | null
          space_id?: number | null
          status?: string | null
          task_id?: number
          task_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: number | null
        }
        Relationships: [
          { foreignKeyName: "tasks_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activity"; referencedColumns: ["activity_id"] },
          { foreignKeyName: "tasks_asset_id_fkey"; columns: ["asset_id"]; isOneToOne: false; referencedRelation: "assets"; referencedColumns: ["asset_id"] },
          { foreignKeyName: "tasks_assigned_user_id_fkey"; columns: ["assigned_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
          { foreignKeyName: "tasks_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
          { foreignKeyName: "tasks_floor_id_fkey"; columns: ["floor_id"]; isOneToOne: false; referencedRelation: "floors"; referencedColumns: ["floor_id"] },
          { foreignKeyName: "tasks_location_id_fkey"; columns: ["location_id"]; isOneToOne: false; referencedRelation: "locations"; referencedColumns: ["location_id"] },
          { foreignKeyName: "tasks_reccuring_id_fkey"; columns: ["reccuring_id"]; isOneToOne: false; referencedRelation: "reccuring"; referencedColumns: ["reccuring_id"] },
          { foreignKeyName: "tasks_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["room_id"] },
          { foreignKeyName: "tasks_space_id_fkey"; columns: ["space_id"]; isOneToOne: false; referencedRelation: "spaces"; referencedColumns: ["space_id"] },
          { foreignKeyName: "tasks_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["user_id"] },
        ]
      }
      users: {
        Row: {
          access_token: string | null
          clerk_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          last_name: string | null
          refresh_token: string | null
          role: string | null
          user_id: number
          username: string | null
        }
        Insert: {
          access_token?: string | null
          clerk_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          refresh_token?: string | null
          role?: string | null
          user_id?: number
          username?: string | null
        }
        Update: {
          access_token?: string | null
          clerk_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          refresh_token?: string | null
          role?: string | null
          user_id?: number
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
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

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
      approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          payload: Json
          result: Json | null
          source: string | null
          status: string
          summary: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          payload?: Json
          result?: Json | null
          source?: string | null
          status?: string
          summary?: string | null
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          result?: Json | null
          source?: string | null
          status?: string
          summary?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_checks: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          currency: string | null
          deductible: boolean | null
          deductible_reason: string | null
          expense_date: string | null
          id: string
          match_status: string | null
          matched_expense_id: string | null
          source_text: string | null
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          deductible?: boolean | null
          deductible_reason?: string | null
          expense_date?: string | null
          id?: string
          match_status?: string | null
          matched_expense_id?: string | null
          source_text?: string | null
          user_id?: string
          vendor?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          deductible?: boolean | null
          deductible_reason?: string | null
          expense_date?: string | null
          id?: string
          match_status?: string | null
          matched_expense_id?: string | null
          source_text?: string | null
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          created_at: string
          customer: string | null
          id: string
          invoice_id: string
          next_touch: string | null
          note: string | null
          promised_date: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          customer?: string | null
          id?: string
          invoice_id: string
          next_touch?: string | null
          note?: string | null
          promised_date?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          customer?: string | null
          id?: string
          invoice_id?: string
          next_touch?: string | null
          note?: string | null
          promised_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          customer_name: string | null
          fulfilled_at: string | null
          id: string
          product_id: string
          product_name: string | null
          quantity: number
          status: string
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          customer_name?: string | null
          fulfilled_at?: string | null
          id?: string
          product_id: string
          product_name?: string | null
          quantity: number
          status?: string
          unit_price: number
          user_id?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          customer_name?: string | null
          fulfilled_at?: string | null
          id?: string
          product_id?: string
          product_name?: string | null
          quantity?: number
          status?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: []
      }
      portal_links: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          customer: string | null
          discount_hours: number
          discount_pct: number
          due_date: string | null
          id: string
          installments: number
          invoice_id: string
          responded_at: string | null
          response: string | null
          response_note: string | null
          token: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer?: string | null
          discount_hours?: number
          discount_pct?: number
          due_date?: string | null
          id?: string
          installments?: number
          invoice_id: string
          responded_at?: string | null
          response?: string | null
          response_note?: string | null
          token?: string
          user_id?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer?: string | null
          discount_hours?: number
          discount_pct?: number
          due_date?: string | null
          id?: string
          installments?: number
          invoice_id?: string
          responded_at?: string | null
          response?: string | null
          response_note?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          name: string
          params: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          params: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          params?: Json
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          monthly_fixed_costs: number
          starting_cash: number
          updated_at: string
          user_id: string
        }
        Insert: {
          monthly_fixed_costs?: number
          starting_cash?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          monthly_fixed_costs?: number
          starting_cash?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock: {
        Row: {
          id: string
          product_id: string
          product_name: string | null
          quantity: number
          safety_level: number
          unit_cost: number
          user_id: string
          vendor_id: string | null
        }
        Insert: {
          id?: string
          product_id: string
          product_name?: string | null
          quantity?: number
          safety_level?: number
          unit_cost?: number
          user_id?: string
          vendor_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          product_name?: string | null
          quantity?: number
          safety_level?: number
          unit_cost?: number
          user_id?: string
          vendor_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_portal: {
        Args: { _token: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          customer: string
          discount_hours: number
          discount_pct: number
          due_date: string
          installments: number
          response: string
        }[]
      }
      respond_portal: {
        Args: { _note: string; _response: string; _token: string }
        Returns: boolean
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

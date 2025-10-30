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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      batch_job_items: {
        Row: {
          batch_job_id: string
          case_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          started_at: string | null
          status: string
        }
        Insert: {
          batch_job_id: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          batch_job_id?: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_job_items_batch_job_id_fkey"
            columns: ["batch_job_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_job_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_cases: number
          id: string
          name: string
          processed_cases: number
          source: string | null
          started_at: string | null
          status: string
          successful_cases: number
          total_cases: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_cases?: number
          id?: string
          name: string
          processed_cases?: number
          source?: string | null
          started_at?: string | null
          status?: string
          successful_cases?: number
          total_cases?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_cases?: number
          id?: string
          name?: string
          processed_cases?: number
          source?: string | null
          started_at?: string | null
          status?: string
          successful_cases?: number
          total_cases?: number
        }
        Relationships: []
      }
      benefit_history: {
        Row: {
          benefit_type: string
          case_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          nb: string
          start_date: string | null
          status: string
        }
        Insert: {
          benefit_type: string
          case_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          nb: string
          start_date?: string | null
          status: string
        }
        Update: {
          benefit_type?: string
          case_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          nb?: string
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_analysis: {
        Row: {
          analyzed_at: string
          audit_trail: string | null
          carencia: Json | null
          case_id: string
          draft_payload: Json | null
          fundamentos: string[] | null
          id: string
          lacunas: string[] | null
          last_document_hash: string | null
          qualidade_segurada: string | null
          rmi: Json | null
          valor_causa: number | null
          vinculo_rural_comprovado: boolean | null
        }
        Insert: {
          analyzed_at?: string
          audit_trail?: string | null
          carencia?: Json | null
          case_id: string
          draft_payload?: Json | null
          fundamentos?: string[] | null
          id?: string
          lacunas?: string[] | null
          last_document_hash?: string | null
          qualidade_segurada?: string | null
          rmi?: Json | null
          valor_causa?: number | null
          vinculo_rural_comprovado?: boolean | null
        }
        Update: {
          analyzed_at?: string
          audit_trail?: string | null
          carencia?: Json | null
          case_id?: string
          draft_payload?: Json | null
          fundamentos?: string[] | null
          id?: string
          lacunas?: string[] | null
          last_document_hash?: string | null
          qualidade_segurada?: string | null
          rmi?: Json | null
          valor_causa?: number | null
          vinculo_rural_comprovado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "case_analysis_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_exceptions: {
        Row: {
          case_id: string
          created_at: string | null
          description: string
          exception_type: string
          id: string
          voice_transcribed: boolean | null
        }
        Insert: {
          case_id: string
          created_at?: string | null
          description: string
          exception_type: string
          id?: string
          voice_transcribed?: boolean | null
        }
        Update: {
          case_id?: string
          created_at?: string | null
          description?: string
          exception_type?: string
          id?: string
          voice_transcribed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "case_exceptions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_financial: {
        Row: {
          case_id: string
          created_at: string
          data_protocolo: string | null
          data_recebimento: string | null
          id: string
          observacoes: string | null
          percentual_honorarios: number | null
          status: string
          tipo_conclusao: string | null
          updated_at: string
          valor_causa: number | null
          valor_cliente: number | null
          valor_honorarios: number | null
          valor_recebido: number | null
        }
        Insert: {
          case_id: string
          created_at?: string
          data_protocolo?: string | null
          data_recebimento?: string | null
          id?: string
          observacoes?: string | null
          percentual_honorarios?: number | null
          status: string
          tipo_conclusao?: string | null
          updated_at?: string
          valor_causa?: number | null
          valor_cliente?: number | null
          valor_honorarios?: number | null
          valor_recebido?: number | null
        }
        Update: {
          case_id?: string
          created_at?: string
          data_protocolo?: string | null
          data_recebimento?: string | null
          id?: string
          observacoes?: string | null
          percentual_honorarios?: number | null
          status?: string
          tipo_conclusao?: string | null
          updated_at?: string
          valor_causa?: number | null
          valor_cliente?: number | null
          valor_honorarios?: number | null
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "case_financial_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_jurisprudencias: {
        Row: {
          case_id: string
          id: string
          jurisprudencia_id: string
          relevance_score: number | null
          selected_at: string
        }
        Insert: {
          case_id: string
          id?: string
          jurisprudencia_id: string
          relevance_score?: number | null
          selected_at?: string
        }
        Update: {
          case_id?: string
          id?: string
          jurisprudencia_id?: string
          relevance_score?: number | null
          selected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_jurisprudencias_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_jurisprudencias_jurisprudencia_id_fkey"
            columns: ["jurisprudencia_id"]
            isOneToOne: false
            referencedRelation: "jurisprudencias"
            referencedColumns: ["id"]
          },
        ]
      }
      case_timeline: {
        Row: {
          case_id: string
          concluida: boolean | null
          created_at: string
          data_fase: string
          fase: Database["public"]["Enums"]["fase_processual"]
          id: string
          observacoes: string | null
          ordem: number | null
        }
        Insert: {
          case_id: string
          concluida?: boolean | null
          created_at?: string
          data_fase: string
          fase: Database["public"]["Enums"]["fase_processual"]
          id?: string
          observacoes?: string | null
          ordem?: number | null
        }
        Update: {
          case_id?: string
          concluida?: boolean | null
          created_at?: string
          data_fase?: string
          fase?: Database["public"]["Enums"]["fase_processual"]
          id?: string
          observacoes?: string | null
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "case_timeline_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          author_address: string | null
          author_birth_date: string | null
          author_cpf: string
          author_marital_status: string | null
          author_name: string
          author_phone: string | null
          author_rg: string | null
          author_whatsapp: string | null
          birth_city: string | null
          birth_state: string | null
          child_birth_date: string | null
          child_name: string | null
          created_at: string
          dum: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          family_members: Json | null
          father_cpf: string | null
          father_name: string | null
          has_ra: boolean | null
          has_special_situation: boolean | null
          health_declaration_ubs: Json | null
          id: string
          land_area: number | null
          land_cession_type: string | null
          land_exploited_area: number | null
          land_itr: string | null
          land_municipality: string | null
          land_owner_cpf: string | null
          land_owner_name: string | null
          land_owner_rg: string | null
          land_ownership_type: string | null
          land_property_name: string | null
          land_total_area: number | null
          manual_benefits: Json | null
          marriage_date: string | null
          mother_cpf: string | null
          nit: string | null
          profile: Database["public"]["Enums"]["perfil_segurada"]
          ra_denial_date: string | null
          ra_denial_reason: string | null
          ra_protocol: string | null
          ra_request_date: string | null
          rmi_calculated: number | null
          rural_activities_breeding: string | null
          rural_activities_planting: string | null
          rural_activity_since: string | null
          rural_periods: Json | null
          salario_minimo_history: Json | null
          salario_minimo_ref: number | null
          school_history: Json | null
          special_notes: string | null
          spouse_cpf: string | null
          spouse_name: string | null
          started_with_chat: boolean | null
          status: Database["public"]["Enums"]["case_status"]
          template_url: string | null
          updated_at: string
          urban_periods: Json | null
          valor_causa: number | null
          video_analysis: Json | null
        }
        Insert: {
          author_address?: string | null
          author_birth_date?: string | null
          author_cpf: string
          author_marital_status?: string | null
          author_name: string
          author_phone?: string | null
          author_rg?: string | null
          author_whatsapp?: string | null
          birth_city?: string | null
          birth_state?: string | null
          child_birth_date?: string | null
          child_name?: string | null
          created_at?: string
          dum?: string | null
          event_date: string
          event_type?: Database["public"]["Enums"]["event_type"]
          family_members?: Json | null
          father_cpf?: string | null
          father_name?: string | null
          has_ra?: boolean | null
          has_special_situation?: boolean | null
          health_declaration_ubs?: Json | null
          id?: string
          land_area?: number | null
          land_cession_type?: string | null
          land_exploited_area?: number | null
          land_itr?: string | null
          land_municipality?: string | null
          land_owner_cpf?: string | null
          land_owner_name?: string | null
          land_owner_rg?: string | null
          land_ownership_type?: string | null
          land_property_name?: string | null
          land_total_area?: number | null
          manual_benefits?: Json | null
          marriage_date?: string | null
          mother_cpf?: string | null
          nit?: string | null
          profile?: Database["public"]["Enums"]["perfil_segurada"]
          ra_denial_date?: string | null
          ra_denial_reason?: string | null
          ra_protocol?: string | null
          ra_request_date?: string | null
          rmi_calculated?: number | null
          rural_activities_breeding?: string | null
          rural_activities_planting?: string | null
          rural_activity_since?: string | null
          rural_periods?: Json | null
          salario_minimo_history?: Json | null
          salario_minimo_ref?: number | null
          school_history?: Json | null
          special_notes?: string | null
          spouse_cpf?: string | null
          spouse_name?: string | null
          started_with_chat?: boolean | null
          status?: Database["public"]["Enums"]["case_status"]
          template_url?: string | null
          updated_at?: string
          urban_periods?: Json | null
          valor_causa?: number | null
          video_analysis?: Json | null
        }
        Update: {
          author_address?: string | null
          author_birth_date?: string | null
          author_cpf?: string
          author_marital_status?: string | null
          author_name?: string
          author_phone?: string | null
          author_rg?: string | null
          author_whatsapp?: string | null
          birth_city?: string | null
          birth_state?: string | null
          child_birth_date?: string | null
          child_name?: string | null
          created_at?: string
          dum?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          family_members?: Json | null
          father_cpf?: string | null
          father_name?: string | null
          has_ra?: boolean | null
          has_special_situation?: boolean | null
          health_declaration_ubs?: Json | null
          id?: string
          land_area?: number | null
          land_cession_type?: string | null
          land_exploited_area?: number | null
          land_itr?: string | null
          land_municipality?: string | null
          land_owner_cpf?: string | null
          land_owner_name?: string | null
          land_owner_rg?: string | null
          land_ownership_type?: string | null
          land_property_name?: string | null
          land_total_area?: number | null
          manual_benefits?: Json | null
          marriage_date?: string | null
          mother_cpf?: string | null
          nit?: string | null
          profile?: Database["public"]["Enums"]["perfil_segurada"]
          ra_denial_date?: string | null
          ra_denial_reason?: string | null
          ra_protocol?: string | null
          ra_request_date?: string | null
          rmi_calculated?: number | null
          rural_activities_breeding?: string | null
          rural_activities_planting?: string | null
          rural_activity_since?: string | null
          rural_periods?: Json | null
          salario_minimo_history?: Json | null
          salario_minimo_ref?: number | null
          school_history?: Json | null
          special_notes?: string | null
          spouse_cpf?: string | null
          spouse_name?: string | null
          started_with_chat?: boolean | null
          status?: Database["public"]["Enums"]["case_status"]
          template_url?: string | null
          updated_at?: string
          urban_periods?: Json | null
          valor_causa?: number | null
          video_analysis?: Json | null
        }
        Relationships: []
      }
      document_validation: {
        Row: {
          case_id: string
          checklist: Json | null
          id: string
          is_sufficient: boolean
          missing_docs: Json | null
          score: number
          threshold: number
          validated_at: string
          validation_details: Json | null
        }
        Insert: {
          case_id: string
          checklist?: Json | null
          id?: string
          is_sufficient?: boolean
          missing_docs?: Json | null
          score?: number
          threshold?: number
          validated_at?: string
          validation_details?: Json | null
        }
        Update: {
          case_id?: string
          checklist?: Json | null
          id?: string
          is_sufficient?: boolean
          missing_docs?: Json | null
          score?: number
          threshold?: number
          validated_at?: string
          validation_details?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_validation_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          exif_data: Json | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          parent_document_id: string | null
          uploaded_at: string
        }
        Insert: {
          case_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          exif_data?: Json | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parent_document_id?: string | null
          uploaded_at?: string
        }
        Update: {
          case_id?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          exif_data?: Json | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parent_document_id?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          case_id: string
          docx_path: string | null
          generated_at: string
          html_content: string | null
          id: string
          last_analysis_hash: string | null
          markdown_content: string | null
          payload: Json
          version: number
        }
        Insert: {
          case_id: string
          docx_path?: string | null
          generated_at?: string
          html_content?: string | null
          id?: string
          last_analysis_hash?: string | null
          markdown_content?: string | null
          payload: Json
          version?: number
        }
        Update: {
          case_id?: string
          docx_path?: string | null
          generated_at?: string
          html_content?: string | null
          id?: string
          last_analysis_hash?: string | null
          markdown_content?: string | null
          payload?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drafts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      dropbox_sync: {
        Row: {
          case_id: string | null
          created_at: string
          dropbox_file_id: string | null
          dropbox_path: string
          error_message: string | null
          id: string
          last_sync_at: string | null
          sync_status: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          dropbox_file_id?: string | null
          dropbox_path: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          dropbox_file_id?: string | null
          dropbox_path?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dropbox_sync_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          auto_filled_fields: Json | null
          case_id: string
          chat_messages: Json | null
          document_id: string
          entities: Json
          extracted_at: string
          id: string
          missing_fields: string[] | null
          observations: string[] | null
          periodos_rurais: Json | null
          raw_text: string | null
        }
        Insert: {
          auto_filled_fields?: Json | null
          case_id: string
          chat_messages?: Json | null
          document_id: string
          entities?: Json
          extracted_at?: string
          id?: string
          missing_fields?: string[] | null
          observations?: string[] | null
          periodos_rurais?: Json | null
          raw_text?: string | null
        }
        Update: {
          auto_filled_fields?: Json | null
          case_id?: string
          chat_messages?: Json | null
          document_id?: string
          entities?: Json
          extracted_at?: string
          id?: string
          missing_fields?: string[] | null
          observations?: string[] | null
          periodos_rurais?: Json | null
          raw_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extractions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statistics: {
        Row: {
          created_at: string | null
          id: string
          periodo_fim: string
          periodo_inicio: string
          periodo_tipo: string
          total_acordos: number | null
          total_protocoladas: number | null
          total_sentencas_improcedentes: number | null
          total_sentencas_procedentes: number | null
          updated_at: string | null
          valor_total_cliente: number | null
          valor_total_honorarios: number | null
          valor_total_recebido: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          periodo_fim: string
          periodo_inicio: string
          periodo_tipo: string
          total_acordos?: number | null
          total_protocoladas?: number | null
          total_sentencas_improcedentes?: number | null
          total_sentencas_procedentes?: number | null
          updated_at?: string | null
          valor_total_cliente?: number | null
          valor_total_honorarios?: number | null
          valor_total_recebido?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          periodo_tipo?: string
          total_acordos?: number | null
          total_protocoladas?: number | null
          total_sentencas_improcedentes?: number | null
          total_sentencas_procedentes?: number | null
          updated_at?: string | null
          valor_total_cliente?: number | null
          valor_total_honorarios?: number | null
          valor_total_recebido?: number | null
        }
        Relationships: []
      }
      jurisprudence_cache: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          hits: number | null
          id: string
          profile: Database["public"]["Enums"]["perfil_segurada"]
          query_hash: string
          results: Json
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["event_type"]
          hits?: number | null
          id?: string
          profile: Database["public"]["Enums"]["perfil_segurada"]
          query_hash: string
          results: Json
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          hits?: number | null
          id?: string
          profile?: Database["public"]["Enums"]["perfil_segurada"]
          query_hash?: string
          results?: Json
        }
        Relationships: []
      }
      jurisprudence_results: {
        Row: {
          case_id: string
          created_at: string | null
          id: string
          last_case_hash: string | null
          results: Json
          selected_ids: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string | null
          id?: string
          last_case_hash?: string | null
          results: Json
          selected_ids?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string | null
          id?: string
          last_case_hash?: string | null
          results?: Json
          selected_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "jurisprudence_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisprudencias: {
        Row: {
          created_at: string
          data_decisao: string | null
          ementa: string | null
          id: string
          link: string | null
          processo_numero: string | null
          tags: string[] | null
          tema: string | null
          tese: string
          trecho_chave: string | null
          tribunal: string
        }
        Insert: {
          created_at?: string
          data_decisao?: string | null
          ementa?: string | null
          id?: string
          link?: string | null
          processo_numero?: string | null
          tags?: string[] | null
          tema?: string | null
          tese: string
          trecho_chave?: string | null
          tribunal: string
        }
        Update: {
          created_at?: string
          data_decisao?: string | null
          ementa?: string | null
          id?: string
          link?: string | null
          processo_numero?: string | null
          tags?: string[] | null
          tema?: string | null
          tese?: string
          trecho_chave?: string | null
          tribunal?: string
        }
        Relationships: []
      }
      processing_queue: {
        Row: {
          analysis_completed_at: string | null
          analysis_status: string | null
          case_id: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          jurisprudence_completed_at: string | null
          jurisprudence_status: string | null
          retry_count: number | null
          started_at: string | null
          status: string
          updated_at: string | null
          validation_completed_at: string | null
          validation_status: string | null
        }
        Insert: {
          analysis_completed_at?: string | null
          analysis_status?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          jurisprudence_completed_at?: string | null
          jurisprudence_status?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          validation_completed_at?: string | null
          validation_status?: string | null
        }
        Update: {
          analysis_completed_at?: string | null
          analysis_status?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          jurisprudence_completed_at?: string | null
          jurisprudence_status?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          validation_completed_at?: string | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_queue_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_reports: {
        Row: {
          campos_faltantes: string[] | null
          case_id: string | null
          competencia: string | null
          created_at: string | null
          dados_completos: boolean | null
          document_type: string
          enderecamento_ok: boolean | null
          fonte: string | null
          generated_at: string | null
          id: string
          issues: Json | null
          jurisdicao_confianca: string | null
          jurisdicao_ok: boolean | null
          jurisdicao_validada: Json | null
          status: string
          valor_causa_referencia: number | null
          valor_causa_validado: boolean | null
        }
        Insert: {
          campos_faltantes?: string[] | null
          case_id?: string | null
          competencia?: string | null
          created_at?: string | null
          dados_completos?: boolean | null
          document_type: string
          enderecamento_ok?: boolean | null
          fonte?: string | null
          generated_at?: string | null
          id?: string
          issues?: Json | null
          jurisdicao_confianca?: string | null
          jurisdicao_ok?: boolean | null
          jurisdicao_validada?: Json | null
          status: string
          valor_causa_referencia?: number | null
          valor_causa_validado?: boolean | null
        }
        Update: {
          campos_faltantes?: string[] | null
          case_id?: string | null
          competencia?: string | null
          created_at?: string | null
          dados_completos?: boolean | null
          document_type?: string
          enderecamento_ok?: boolean | null
          fonte?: string | null
          generated_at?: string | null
          id?: string
          issues?: Json | null
          jurisdicao_confianca?: string | null
          jurisdicao_ok?: boolean | null
          jurisdicao_validada?: Json | null
          status?: string
          valor_causa_referencia?: number | null
          valor_causa_validado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          placeholder_mapping: Json
          template_path: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          placeholder_mapping?: Json
          template_path: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          placeholder_mapping?: Json
          template_path?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      teses_juridicas: {
        Row: {
          case_id: string
          created_at: string | null
          id: string
          selected_ids: string[] | null
          teses: Json
        }
        Insert: {
          case_id: string
          created_at?: string | null
          id?: string
          selected_ids?: string[] | null
          teses: Json
        }
        Update: {
          case_id?: string
          created_at?: string | null
          id?: string
          selected_ids?: string[] | null
          teses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "teses_juridicas_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          case_id: string
          created_at: string
          event_date: string
          event_description: string
          id: string
          source_document_id: string | null
          source_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
        }
        Insert: {
          case_id: string
          created_at?: string
          event_date: string
          event_description: string
          id?: string
          source_document_id?: string | null
          source_document_type?:
            | Database["public"]["Enums"]["document_type"]
            | null
        }
        Update: {
          case_id?: string
          created_at?: string
          event_date?: string
          event_description?: string
          id?: string
          source_document_id?: string | null
          source_document_type?:
            | Database["public"]["Enums"]["document_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      case_status:
        | "intake"
        | "pending_docs"
        | "validating"
        | "analyzing"
        | "ready"
        | "drafted"
        | "exported"
        | "protocolada"
        | "em_audiencia"
        | "acordo"
        | "sentenca"
      document_type:
        | "CNIS"
        | "CERTIDAO"
        | "CAF"
        | "DAP"
        | "NOTA_PRODUTOR"
        | "ITR"
        | "CCIR"
        | "DECL_SINDICAL"
        | "COMPROV_RESID"
        | "FOTOS"
        | "OUTROS"
        | "procuracao"
        | "certidao_nascimento"
        | "identificacao"
        | "comprovante_residencia"
        | "autodeclaracao_rural"
        | "documento_terra"
        | "processo_administrativo"
        | "outro"
        | "ficha_atendimento"
        | "carteira_pescador"
        | "historico_escolar"
        | "declaracao_saude_ubs"
        | "cnis"
      event_type: "parto" | "adocao" | "guarda"
      fase_processual:
        | "distribuida"
        | "citacao_inss"
        | "contestacao"
        | "impugnacao"
        | "despacho_saneador"
        | "especificacao_provas"
        | "juntada_documentos"
        | "audiencia_instrucao"
        | "alegacoes_finais"
        | "acordo"
        | "sentenca"
      perfil_segurada: "especial" | "urbana"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      case_status: [
        "intake",
        "pending_docs",
        "validating",
        "analyzing",
        "ready",
        "drafted",
        "exported",
        "protocolada",
        "em_audiencia",
        "acordo",
        "sentenca",
      ],
      document_type: [
        "CNIS",
        "CERTIDAO",
        "CAF",
        "DAP",
        "NOTA_PRODUTOR",
        "ITR",
        "CCIR",
        "DECL_SINDICAL",
        "COMPROV_RESID",
        "FOTOS",
        "OUTROS",
        "procuracao",
        "certidao_nascimento",
        "identificacao",
        "comprovante_residencia",
        "autodeclaracao_rural",
        "documento_terra",
        "processo_administrativo",
        "outro",
        "ficha_atendimento",
        "carteira_pescador",
        "historico_escolar",
        "declaracao_saude_ubs",
        "cnis",
      ],
      event_type: ["parto", "adocao", "guarda"],
      fase_processual: [
        "distribuida",
        "citacao_inss",
        "contestacao",
        "impugnacao",
        "despacho_saneador",
        "especificacao_provas",
        "juntada_documentos",
        "audiencia_instrucao",
        "alegacoes_finais",
        "acordo",
        "sentenca",
      ],
      perfil_segurada: ["especial", "urbana"],
    },
  },
} as const

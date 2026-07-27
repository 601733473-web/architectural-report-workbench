/* Generated from the canonical JSON Schemas. Do not edit by hand. */

export interface DesignReportProjectFacts {
  project_id: string;
  project_name_anonymized?: string;
  default_page_format?: "A3_landscape_420x297mm";
  language_mode?: "zh" | "zh_en";
  ignore_company_info?: true;
  documents: {
    document_id: string;
    file_name: string;
    role: "authoritative" | "proposal" | "reference_style" | "company_info" | "unknown";
    version_or_date: string;
    authority_rank?: number;
    notes?: string;
  }[];
  facts: {
    fact_id: string;
    category:
      | "project"
      | "site"
      | "planning_control"
      | "program"
      | "area"
      | "circulation"
      | "space_requirement"
      | "technical_requirement"
      | "deliverable"
      | "schedule"
      | "evaluation_priority"
      | "proposal_design"
      | "other";
    field_path: string;
    value_raw: unknown;
    value_normalized?: unknown;
    unit?: string | null;
    source: {
      document_id: string;
      page: number;
      location_note?: string;
      /**
       * 支持该事实的原文引用，不得改写。
       */
      quote: string;
    };
    source_role?: "brief_fact" | "proposal_fact";
    confidence?: number;
    status: "confirmed" | "needs_confirmation" | "conflict" | "superseded";
    notes?: string;
  }[];
  style_observations?: {
    observation_id: string;
    description: string;
    source: {
      document_id: string;
      pages: number[];
    };
  }[];
  conflicts: {
    conflict_id: string;
    field_path: string;
    /**
     * @minItems 2
     */
    fact_ids: [string, string, ...string[]];
    severity: "blocking" | "important" | "minor";
    resolution_status: "unresolved" | "resolved" | "accepted_difference";
    resolution_note?: string;
  }[];
  missing_items: {
    item_id: string;
    description: string;
    severity: "blocking" | "important" | "optional";
    blocks: ("planner" | "page_generation" | "consistency_review")[];
    suggested_source?: string;
  }[];
  gate_report?: {
    planner_readiness: "ready" | "partial" | "blocked";
    generation_readiness: "ready" | "partial" | "blocked";
    gate_a_missing: string[];
    gate_b_missing: string[];
    summary?: string;
  };
}

export interface DesignReportPagePlan {
  /**
   * 全篇只保留一个中心主张。
   */
  narrative_claim: string;
  page_format: "A3_landscape_420x297mm";
  language_mode?: "zh" | "zh_en";
  target_page_count?: number;
  sections: {
    section_id: string;
    title_zh: string;
    title_en?: string;
    purpose: string;
    answers_question?: string;
  }[];
  pages: {
    page_id: string;
    display_page_number?: number | null;
    section_id: string;
    page_type:
      | "cover"
      | "toc"
      | "section_divider"
      | "position"
      | "analysis"
      | "strategy"
      | "concept"
      | "comparison"
      | "masterplan"
      | "plan"
      | "section"
      | "rendering"
      | "technical"
      | "data"
      | "summary";
    /**
     * 本页唯一结论。
     */
    core_message: string;
    headline_zh: string;
    headline_en?: string;
    body_zh?: string;
    body_en?: string;
    /**
     * 当前版本的中文页面正文；一次只生成一页。
     */
    body_copy: string;
    diagram_labels: string[];
    speaker_notes: string;
    visual_requirements: string[];
    /**
     * @maxItems 8
     */
    callouts?:
      | []
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          },
          {
            label_zh: string;
            label_en?: string;
            fact_ref?: string;
          }
        ];
    visual_brief?: string[];
    fact_refs: string[];
    unresolved_items?: string[];
    missing_information: string[];
    generation_status: "ready" | "placeholder" | "blocked" | "generated" | "reviewed";
  }[];
  audit_report?: {
    reviewed_page_ids: string[];
    issues: {
      severity: "blocking" | "major" | "minor";
      pages: string[];
      issue: string;
      evidence: string;
      fact_refs: string[];
      recommended_fix: string;
    }[];
    summary: string;
  };
}

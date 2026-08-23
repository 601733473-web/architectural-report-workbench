/* Generated from the canonical JSON Schemas. Do not edit by hand. */

export interface DesignReportProjectFacts {
  project_id: string;
  /**
   * 新建任务时由用户选择的生产模式。大型公共建筑沿用建筑汇报参考与 Gate B；小型建筑/装置只依据任务书事实和其中明确的设计方向组织页面。
   */
  task_mode?: "large_public_building" | "small_building_or_interior";
  project_name_anonymized?: string;
  default_page_format?: "A3_landscape_420x297mm";
  language_mode?: "zh" | "zh_en";
  ignore_company_info?: true;
  documents: {
    document_id: string;
    file_name: string;
    role: "authoritative" | "proposal" | "reference_style" | "site_research" | "company_info" | "unknown";
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
    original_value_raw?: unknown;
    /**
     * 当前采用值的来源。user_confirmed 表示用户在事实面板中明确确认；external_research 表示来自可追溯公开数据的场地研究，二者均不得伪装成任务书原文。
     */
    value_origin?: "source_extracted" | "user_confirmed" | "external_research";
    /**
     * 事实面板中的多轮用户确认记录。原始来源、页码与引文始终保留在 source 中。
     */
    revision_history?: {
      revision_id: string;
      round: number;
      previous_value: unknown;
      confirmed_value: unknown;
      user_message: string;
      assistant_message: string;
      created_at: string;
    }[];
    unit?: string | null;
    source: {
      document_id: string;
      page: number;
      location_note?: string;
      url?: string;
      retrieved_at?: string;
      /**
       * 支持该事实的原文引用，不得改写。
       */
      quote: string;
    };
    source_role?: "brief_fact" | "proposal_fact" | "research_fact";
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
  /**
   * 从历史汇报中精选、脱敏且可追溯的页级文风与版式样本。历史项目事实不得进入当前项目 facts。
   */
  reference_style_examples?: {
    example_id: string;
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
    source: {
      document_id: string;
      page: number;
      /**
       * 用于人工追溯的历史原文短引；逐页生成时不得直接发送。
       */
      quote: string;
    };
    /**
     * 去除历史项目名称、数字、功能结论后的可迁移表达模板。
     */
    sanitized_template: string;
    /**
     * @minItems 1
     */
    rhetorical_pattern: [string, ...string[]];
    headline_pattern: string;
    /**
     * @minItems 1
     */
    layout_recipe: [string, ...string[]];
    style_tags: string[];
    forbidden_terms: string[];
  }[];
  /**
   * 由历史汇报结构化标注生成的安全经验投影。只保存叙事角色、转场和页面配方，不保存历史项目事实、原文或标题候选。
   */
  reference_experience?: {
    source_document_id: string;
    /**
     * @minItems 1
     */
    source_documents: [
      {
        source_document_id: string;
        display_name: string;
        source_page_count: number;
        narrative_page_count: number;
        recipe_count: number;
      },
      ...{
        source_document_id: string;
        display_name: string;
        source_page_count: number;
        narrative_page_count: number;
        recipe_count: number;
      }[]
    ];
    source_schema_version: number;
    source_page_count: number;
    safe_projection_version: number;
    narrative_pages: {
      order: number;
      source_document_id: string;
      page_number: number;
      chapter: string;
      page_family: string;
      page_type_label: string;
      page_role:
        | "section_divider"
        | "fact_evidence"
        | "problem_definition"
        | "strategy_statement"
        | "design_action"
        | "technical_proof"
        | "visual_showcase";
      reuse_level: "representative" | "supporting" | "low";
      reference_quality: string;
      can_merge_with_next: boolean;
      scheme_branch: "shared" | "one_tower" | "two_tower" | "comparison";
      parallel_step_key?: string;
    }[];
    transition_patterns: {
      from_role: string;
      to_role: string;
      source_document_id: string;
      count: number;
      example_pages: string[];
    }[];
    page_recipes: {
      recipe_id: string;
      source_document_id: string;
      page_type_label: string;
      canonical_page_type:
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
      page_role: string;
      primary_visual: string;
      supporting_visuals: string[];
      needs_drawings: boolean;
      asset_slots: {
        slot: string;
        visual_type: string;
        count: number;
        label: string;
      }[];
      text_weight: "low" | "medium" | "high";
      layout_hint: string;
      /**
       * 脱敏后的页面主题标签，用于语义检索，不得包含历史项目专名。
       */
      topics?: (
        | "identity"
        | "location"
        | "site_context"
        | "constraints"
        | "circulation"
        | "public_space"
        | "program"
        | "massing"
        | "concept"
        | "landscape"
        | "sustainability"
        | "masterplan"
        | "plan"
        | "section"
        | "facade"
        | "structure"
        | "technical"
        | "rendering"
        | "system_rendering"
        | "comparison"
        | "data"
        | "summary"
        | "strategy_overview"
      )[];
      /**
       * 页面承担的叙事任务。
       */
      page_intents?: (
        | "introduce"
        | "orient"
        | "analyze"
        | "define_problem"
        | "state_strategy"
        | "explain_generation"
        | "verify_design"
        | "prove_technical"
        | "showcase"
        | "transition"
        | "summarize"
      )[];
      /**
       * 页面依赖的证据与素材类型。
       */
      evidence_types?: (
        | "text"
        | "map"
        | "analysis_diagram"
        | "concept_diagram"
        | "masterplan"
        | "floor_plan"
        | "section"
        | "elevation"
        | "rendering"
        | "data_table"
        | "photo"
      )[];
      /**
       * 脱敏的布局家族标识，用于全篇避免连续同构。
       */
      layout_family?: string;
      /**
       * 多方案样本中的叙事分支；普通样本使用shared。
       */
      scheme_branch: "shared" | "one_tower" | "two_tower" | "comparison";
      /**
       * 平行方案中承担相同步骤的页面键，用于建立跨方案对应关系。
       */
      parallel_step_key?: string;
      /**
       * @minItems 1
       */
      source_pages: [number, ...number[]];
      reuse_level: "representative" | "supporting" | "low";
    }[];
    excluded_fields: string[];
  };
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
  /**
   * 针对 Gate B 缺口生成并由用户确认的设计方向。它们是设计决策，不属于带原文出处的项目事实。
   */
  gate_b_proposals?: {
    missing_item_id: string;
    missing_label: string;
    /**
     * agent_missing 来自 Agent 的完整度检查；user_created 是用户主动定义的设计提案。
     */
    origin?: "agent_missing" | "user_created";
    user_defined_title?: string;
    target_page_types?: (
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
      | "summary"
    )[];
    created_at?: string;
    status: "awaiting_choice" | "selected" | "user_defined" | "confirmed";
    question: string;
    task_brief_fact_refs: string[];
    /**
     * @maxItems 3
     */
    options:
      | []
      | [
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          }
        ]
      | [
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          },
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          }
        ]
      | [
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          },
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          },
          {
            option_id: string;
            title: string;
            summary: string;
            /**
             * @minItems 1
             */
            design_moves: [string, ...string[]];
            rationale: string;
            task_brief_fact_refs: string[];
            assumptions: string[];
            validation_needed: string[];
          }
        ];
    selected_option_id: string | null;
    user_input: string;
    confirmed_direction: string;
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
  /**
   * 页面排版与生成管线所属模式。小型建筑/装置管线不使用大型公共建筑的历史参考页型。
   */
  task_mode?: "large_public_building" | "small_building_or_interior";
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
    /**
     * 本页唯一结论的英文翻译，用于中英双语页面与 PDF。
     */
    core_message_en?: string;
    /**
     * 主要显示标题，必须使用简体中文。
     */
    headline_zh: string;
    /**
     * 英文标题；中英双语页面与 PDF 必须显示。
     */
    headline_en?: string;
    /**
     * 中文页面正文，必须使用简体中文。
     */
    body_zh?: string;
    /**
     * 英文正文；中英双语页面与 PDF 必须显示。
     */
    body_en?: string;
    /**
     * 当前版本用于页面显示的简体中文正文；一次只生成一页。
     */
    body_copy: string;
    /**
     * 依据单页最低内容标准生成的可重复审核结果。封面、目录和章节页不参与正文深度审核。
     */
    content_depth_check?: {
      status: "pass" | "needs_improvement";
      applicable: boolean;
      evaluated_at: string;
      conclusion_present: boolean;
      body_point_count: number;
      evidence_count: number;
      image_caption_count: number;
      required_image_caption_count: number;
      confirmed_proposal_count: number;
      unsupported_numbers: string[];
      issues: string[];
    };
    /**
     * 页面直接显示的中文图解标签；专业缩写可保留英文。
     */
    diagram_labels: string[];
    /**
     * 与 diagram_labels 按顺序对应的英文图解标签。
     */
    diagram_labels_en?: string[];
    /**
     * 中文讲述提示。
     */
    speaker_notes: string;
    /**
     * 中文视觉要求。
     */
    visual_requirements: string[];
    /**
     * @maxItems 8
     */
    callouts?:
      | []
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ]
      | [
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          },
          {
            /**
             * 页面主要显示的中文标签。
             */
            label_zh: string;
            /**
             * 英文标签；中英双语页面与 PDF 必须显示。
             */
            label_en?: string;
            fact_ref?: string;
          }
        ];
    visual_brief?: string[];
    /**
     * 本页匹配的历史风格样本编号，只用于文字结构与版式指导。
     */
    style_example_refs?: string[];
    /**
     * 本页匹配的结构化历史页面配方编号，只用于叙事角色、素材槽位与版式指导。
     */
    experience_recipe_refs?: string[];
    /**
     * 围绕当前项目证据生成的单页视觉任务单及多轮确认记录。历史样本只提供版式与图解组织方式。
     */
    visual_task?: {
      page_id: string;
      status: "draft" | "awaiting_choice" | "awaiting_materials" | "ready" | "approved";
      objective: string;
      production_mode: "source_rework" | "diagram" | "concept_sequence" | "render_direction" | "mixed";
      primary_visual: string;
      /**
       * 由页面内容关系确定并锁定的图片槽编排。后续改文案、换参考图或 AI 生图不得改变该值。
       */
      frame_layout?: "single" | "row" | "lead_top" | "lead_left" | "two_by_two" | "two_by_three";
      /**
       * 从本页核心结论、叙事关系和当前项目证据出发形成的第一性视觉需求判断。它直接指导参考素材检索和 Graphic 生成，不是供用户选择的风格选项。
       */
      visual_intent: {
        conclusion_to_prove: string;
        relationship_to_show:
          | "sequence"
          | "comparison"
          | "hierarchy"
          | "spatial_relationship"
          | "evidence_mapping"
          | "atmosphere"
          | "index";
        /**
         * @minItems 1
         * @maxItems 8
         */
        evidence_needed:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | [string, string, string, string, string, string]
          | [string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string];
        /**
         * @minItems 1
         * @maxItems 8
         */
        graphic_elements:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | [string, string, string, string, string, string]
          | [string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string];
        /**
         * @minItems 1
         * @maxItems 8
         */
        search_focus:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | [string, string, string, string, string, string]
          | [string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string];
        layout_logic: string;
      };
      /**
       * 当前页面实际需要填充的独立图片槽。每个槽对应一个明确的内容任务；多步骤、多方案页面不得把一张图重复铺入多个槽。
       *
       * @maxItems 6
       */
      image_slots:
        | []
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ]
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ]
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ]
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ]
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ]
        | [
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            },
            {
              slot_id: string;
              label: string;
              purpose: string;
              prompt_focus: string;
              aspect_ratio: "wide" | "landscape" | "square" | "portrait";
            }
          ];
      available_inputs: string[];
      missing_inputs: string[];
      /**
       * @minItems 1
       */
      generation_steps: [string, ...string[]];
      constraints: string[];
      ai_generation_policy: string;
      reference_recipe_refs: string[];
      /**
       * 本页从精选视觉参考库宽召回的内部候选编号。只供模型语义复排，不得作为前台候选列表显示。
       */
      visual_reference_refs: string[];
      /**
       * 文本大模型根据本页第一性视觉需求、证据类型和当前项目素材，对宽召回结果进行语义复排后的内部选择记录。不得在前台显示选择理由、置信度或候选清单。
       */
      reference_selection?: {
        status: "matched" | "no_suitable_reference";
        selection_method: "model_semantic_rerank";
        selected_visual_id: string | null;
        confidence: number;
        internal_rationale: string;
        evaluated_at: string;
      };
      /**
       * 系统理解本页视觉需求后自动生成的可见 A3 构图草案。它是结构预览，不冒充最终效果图或已完成图纸。
       */
      draft_output?: {
        status: "conceptual" | "material_ready";
        title: string;
        format: "diagram_wireframe" | "drawing_rework_plan" | "concept_sequence" | "render_shot_list";
        description: string;
        /**
         * @minItems 1
         * @maxItems 6
         */
        zones:
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ]
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ]
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ]
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ]
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ]
          | [
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              },
              {
                zone_id: string;
                label: string;
                content: string;
                evidence_refs: string[];
              }
            ];
        prompt_zh: string;
        disclaimer: string;
      };
      /**
       * 兼容旧数据的首张素材库裁剪图。新页面以 slot_reference_crops 作为各图片槽的唯一素材库映射依据。
       */
      reference_crop?: {
        status: "selected";
        visual_id: string;
        image_url: string;
        background_position: string;
        crop_zoom: number;
        selected_at: string;
      };
      /**
       * 由文本大模型从精选视觉素材库为达到匹配阈值的图片槽分别选择的原始参考图。未达到阈值的槽保持空白，不得用第一张候选强制补位；用户只能针对已有参考的一个 slot_id 单独发起 AI 重生成。
       *
       * @minItems 1
       * @maxItems 6
       */
      slot_reference_crops?:
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ]
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ]
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ]
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ]
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ]
        | [
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            },
            {
              slot_id: string;
              status: "selected";
              visual_id: string;
              image_url: string;
              background_position: string;
              crop_zoom: number;
              selected_at: string;
            }
          ];
      /**
       * 文本模型返回的后台提示词导演草稿与元数据。它用于后台组装最终生图请求，不等于实际提交给图像模型的完整提示词，也不得作为汇报正文显示。
       */
      image_prompt?: {
        /**
         * 文本模型返回的后台提示词草稿；不是图像接口最终收到的完整提示词。
         */
        prompt_zh: string;
        /**
         * 文本模型返回的后台负向提示词草稿；最终提交值可能由系统追加边界规则。
         */
        negative_prompt_zh: string;
        visual_type: string;
        /**
         * 当前被选中图片槽的实际宽高比，格式为宽:高；不是整张 A3 页面的比例。
         */
        aspect_ratio: string;
        /**
         * @minItems 1
         * @maxItems 12
         */
        style_keywords:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | [string, string, string, string, string, string]
          | [string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string, string, string, string]
          | [string, string, string, string, string, string, string, string, string, string, string, string];
      };
      /**
       * 兼容旧数据的首张低分辨率意向参考图。新页面以 generated_images 作为各图片槽的唯一映射依据。
       */
      generated_image?: {
        status: "generated";
        model: string;
        /**
         * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
         */
        prompt_zh?: string;
        /**
         * 图像接口请求中实际提交的完整中文提示文本，包含系统追加的参考图、边界和负向约束语义；这是提示词审计的规范字段。
         */
        submitted_prompt_zh?: string;
        /**
         * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
         */
        submitted_negative_prompt_zh?: string;
        /**
         * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
         */
        prompt_provenance?: "submitted_to_image_model";
        size: string;
        image_url: string;
        generated_at: string;
        provider_response_id: string;
        image_count: number;
        /**
         * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
         */
        attempt_count?: number;
        /**
         * 本次图像生成实际使用的精选视觉参考图。仅用于构图层级、留白、视觉节奏和 graphic 语言引导，不得复制历史项目内容。
         */
        reference_guidance?: {
          visual_id: string;
          image_url: string;
          usage_scope: "composition_hierarchy_style_only";
        };
        disclaimer: string;
      };
      /**
       * 图像模型按 image_slots 分别生成的低分辨率图片素材，可包含少量必要标签。每张图只能填入 slot_id 指定的图框。
       *
       * @minItems 1
       * @maxItems 6
       */
      generated_images?:
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ]
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ]
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ]
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ]
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ]
        | [
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            },
            {
              slot_id: string;
              prompt_focus: string;
              status: "generated";
              model: string;
              /**
               * 本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。
               */
              prompt_zh?: string;
              /**
               * 图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。
               */
              submitted_prompt_zh?: string;
              /**
               * 本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。
               */
              submitted_negative_prompt_zh?: string;
              /**
               * 明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。
               */
              prompt_provenance?: "submitted_to_image_model";
              size: string;
              image_url: string;
              generated_at: string;
              provider_response_id: string;
              image_count: number;
              /**
               * 本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。
               */
              attempt_count?: number;
              reference_guidance?: {
                visual_id: string;
                image_url: string;
                usage_scope: "composition_hierarchy_style_only";
              };
              disclaimer: string;
            }
          ];
      conversation: {
        round: number;
        role: "user" | "assistant";
        content: string;
      }[];
    };
    fact_refs: string[];
    /**
     * 本页实际采用的已确认 Gate B 提案编号。仅用于设计决策追踪，不得伪装成任务书事实。
     */
    proposal_refs?: string[];
    /**
     * 记录每项已确认提案如何实质进入本页可见文案。visible_statement 必须逐字出现在正文、图解标签或标注中。
     */
    proposal_coverage?: {
      proposal_id: string;
      visible_statement: string;
      /**
       * @minItems 1
       */
      applied_design_moves: [string, ...string[]];
    }[];
    /**
     * 本页最近一次同步的已确认提案上下文指纹，用于在提案变化后使旧文案失效。
     */
    proposal_context_hash?: string;
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

export type IdList = string[];

export interface DesignReportNarrative {
  document_title_zh: string;
  document_subtitle_zh: string;
  source_scope_note: string;
  executive_concept: {
    statement_zh: string;
    /**
     * @minItems 3
     */
    keywords_zh: [string, string, string, ...string[]];
    fact_refs: IdList;
    proposal_refs: IdList;
    page_refs: IdList;
  };
  /**
   * @minItems 8
   * @maxItems 10
   */
  chapters:
    | [
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        }
      ]
    | [
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        }
      ]
    | [
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        },
        {
          chapter_id: string;
          order: number;
          title_zh: string;
          lead_zh: string;
          /**
           * @minItems 1
           * @maxItems 3
           */
          subsections:
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ]
            | [
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                },
                {
                  heading_zh: string;
                  /**
                   * @minItems 1
                   * @maxItems 2
                   */
                  paragraphs_zh: [string] | [string, string];
                  bullet_points_zh: string[];
                  fact_refs: IdList;
                  proposal_refs: IdList;
                  page_refs: IdList;
                }
              ];
          fact_refs: IdList;
          proposal_refs: IdList;
          page_refs: IdList;
        }
      ];
  /**
   * @minItems 3
   */
  value_summary: [
    {
      label_zh: string;
      statement_zh: string;
      fact_refs: IdList;
      proposal_refs: IdList;
      page_refs: IdList;
    },
    {
      label_zh: string;
      statement_zh: string;
      fact_refs: IdList;
      proposal_refs: IdList;
      page_refs: IdList;
    },
    {
      label_zh: string;
      statement_zh: string;
      fact_refs: IdList;
      proposal_refs: IdList;
      page_refs: IdList;
    },
    ...{
      label_zh: string;
      statement_zh: string;
      fact_refs: IdList;
      proposal_refs: IdList;
      page_refs: IdList;
    }[]
  ];
  coverage: {
    source_document_ids: IdList;
    fact_refs: IdList;
    proposal_refs: IdList;
    page_refs: IdList;
    known_gaps: string[];
  };
}

export interface DesignReportVisualReferenceLibrary {
  library_id: string;
  version: number;
  /**
   * @minItems 1
   */
  source_documents: [
    {
      source_document_id: string;
      display_name: string;
      source_page_count: number;
      selected_page_count: number;
    },
    ...{
      source_document_id: string;
      display_name: string;
      source_page_count: number;
      selected_page_count: number;
    }[]
  ];
  selection_method: {
    target_count: number;
    /**
     * @minItems 1
     */
    criteria: [string, ...string[]];
  };
  /**
   * @minItems 1
   */
  entries: [
    {
      visual_id: string;
      source_document_id: string;
      source_page: number;
      image_path: string;
      graphic_crop_path: string;
      graphic_crop_width: number;
      graphic_crop_height: number;
      /**
       * @minItems 4
       * @maxItems 4
       */
      graphic_crop_box: [number, number, number, number];
      graphic_crop_source: "embedded_image" | "rendered_component";
      /**
       * 裁图后的自动质量检测。低质量素材不会进入运行时匹配候选。
       */
      crop_quality: {
        score: number;
        accepted: boolean;
        blank_ratio: number;
        text_ratio: number;
        effective_area_ratio: number;
        sharpness: number;
        rejection_reasons: string[];
      };
      thumbnail_width: number;
      thumbnail_height: number;
      /**
       * @minItems 1
       * @maxItems 5
       */
      dominant_colors:
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string];
      brightness: "light" | "balanced" | "dark";
      edge_density: number;
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
      page_role:
        | "section_divider"
        | "fact_evidence"
        | "problem_definition"
        | "strategy_statement"
        | "design_action"
        | "technical_proof"
        | "visual_showcase";
      scheme_branch: "shared" | "one_tower" | "two_tower" | "comparison";
      topics: string[];
      page_intents: string[];
      visual_type: string;
      evidence_types: string[];
      layout_family: string;
      required_current_assets: string[];
      /**
       * @minItems 1
       */
      recipe_refs: [string, ...string[]];
      quality: "featured" | "supporting";
      retrieval_text: string;
      safe_use_guidance: string;
    },
    ...{
      visual_id: string;
      source_document_id: string;
      source_page: number;
      image_path: string;
      graphic_crop_path: string;
      graphic_crop_width: number;
      graphic_crop_height: number;
      /**
       * @minItems 4
       * @maxItems 4
       */
      graphic_crop_box: [number, number, number, number];
      graphic_crop_source: "embedded_image" | "rendered_component";
      /**
       * 裁图后的自动质量检测。低质量素材不会进入运行时匹配候选。
       */
      crop_quality: {
        score: number;
        accepted: boolean;
        blank_ratio: number;
        text_ratio: number;
        effective_area_ratio: number;
        sharpness: number;
        rejection_reasons: string[];
      };
      thumbnail_width: number;
      thumbnail_height: number;
      /**
       * @minItems 1
       * @maxItems 5
       */
      dominant_colors:
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string];
      brightness: "light" | "balanced" | "dark";
      edge_density: number;
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
      page_role:
        | "section_divider"
        | "fact_evidence"
        | "problem_definition"
        | "strategy_statement"
        | "design_action"
        | "technical_proof"
        | "visual_showcase";
      scheme_branch: "shared" | "one_tower" | "two_tower" | "comparison";
      topics: string[];
      page_intents: string[];
      visual_type: string;
      evidence_types: string[];
      layout_family: string;
      required_current_assets: string[];
      /**
       * @minItems 1
       */
      recipe_refs: [string, ...string[]];
      quality: "featured" | "supporting";
      retrieval_text: string;
      safe_use_guidance: string;
    }[]
  ];
}

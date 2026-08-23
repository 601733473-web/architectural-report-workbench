/* Generated from the canonical JSON Schemas. Do not edit by hand. */

export const projectFactsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DesignReportProjectFacts",
  "type": "object",
  "required": [
    "project_id",
    "documents",
    "facts",
    "conflicts",
    "missing_items"
  ],
  "properties": {
    "project_id": {
      "type": "string"
    },
    "task_mode": {
      "enum": [
        "large_public_building",
        "small_building_or_interior"
      ],
      "default": "large_public_building",
      "description": "新建任务时由用户选择的生产模式。大型公共建筑沿用建筑汇报参考与 Gate B；小型建筑/装置只依据任务书事实和其中明确的设计方向组织页面。"
    },
    "project_name_anonymized": {
      "type": "string"
    },
    "default_page_format": {
      "const": "A3_landscape_420x297mm"
    },
    "language_mode": {
      "enum": [
        "zh",
        "zh_en"
      ],
      "default": "zh_en"
    },
    "ignore_company_info": {
      "const": true
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "document_id",
          "file_name",
          "role",
          "version_or_date"
        ],
        "properties": {
          "document_id": {
            "type": "string"
          },
          "file_name": {
            "type": "string"
          },
          "role": {
            "enum": [
              "authoritative",
              "proposal",
              "reference_style",
              "site_research",
              "company_info",
              "unknown"
            ]
          },
          "version_or_date": {
            "type": "string"
          },
          "authority_rank": {
            "type": "integer",
            "minimum": 1,
            "maximum": 6
          },
          "notes": {
            "type": "string"
          }
        }
      }
    },
    "facts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "fact_id",
          "category",
          "field_path",
          "value_raw",
          "source",
          "status"
        ],
        "properties": {
          "fact_id": {
            "type": "string"
          },
          "category": {
            "enum": [
              "project",
              "site",
              "planning_control",
              "program",
              "area",
              "circulation",
              "space_requirement",
              "technical_requirement",
              "deliverable",
              "schedule",
              "evaluation_priority",
              "proposal_design",
              "other"
            ]
          },
          "field_path": {
            "type": "string"
          },
          "value_raw": {},
          "value_normalized": {},
          "original_value_raw": {},
          "value_origin": {
            "enum": [
              "source_extracted",
              "user_confirmed",
              "external_research"
            ],
            "description": "当前采用值的来源。user_confirmed 表示用户在事实面板中明确确认；external_research 表示来自可追溯公开数据的场地研究，二者均不得伪装成任务书原文。"
          },
          "revision_history": {
            "type": "array",
            "description": "事实面板中的多轮用户确认记录。原始来源、页码与引文始终保留在 source 中。",
            "items": {
              "type": "object",
              "required": [
                "revision_id",
                "round",
                "previous_value",
                "confirmed_value",
                "user_message",
                "assistant_message",
                "created_at"
              ],
              "properties": {
                "revision_id": {
                  "type": "string"
                },
                "round": {
                  "type": "integer",
                  "minimum": 1
                },
                "previous_value": {},
                "confirmed_value": {},
                "user_message": {
                  "type": "string",
                  "minLength": 1
                },
                "assistant_message": {
                  "type": "string",
                  "minLength": 1
                },
                "created_at": {
                  "type": "string"
                }
              }
            }
          },
          "unit": {
            "type": [
              "string",
              "null"
            ]
          },
          "source": {
            "type": "object",
            "required": [
              "document_id",
              "page",
              "quote"
            ],
            "properties": {
              "document_id": {
                "type": "string"
              },
              "page": {
                "type": "integer",
                "minimum": 1
              },
              "location_note": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "retrieved_at": {
                "type": "string"
              },
              "quote": {
                "type": "string",
                "minLength": 1,
                "description": "支持该事实的原文引用，不得改写。"
              }
            }
          },
          "source_role": {
            "enum": [
              "brief_fact",
              "proposal_fact",
              "research_fact"
            ]
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "status": {
            "enum": [
              "confirmed",
              "needs_confirmation",
              "conflict",
              "superseded"
            ]
          },
          "notes": {
            "type": "string"
          }
        }
      }
    },
    "style_observations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "observation_id",
          "description",
          "source"
        ],
        "properties": {
          "observation_id": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "source": {
            "type": "object",
            "required": [
              "document_id",
              "pages"
            ],
            "properties": {
              "document_id": {
                "type": "string"
              },
              "pages": {
                "type": "array",
                "items": {
                  "type": "integer"
                }
              }
            }
          }
        }
      }
    },
    "reference_style_examples": {
      "type": "array",
      "description": "从历史汇报中精选、脱敏且可追溯的页级文风与版式样本。历史项目事实不得进入当前项目 facts。",
      "items": {
        "type": "object",
        "required": [
          "example_id",
          "page_type",
          "source",
          "sanitized_template",
          "rhetorical_pattern",
          "headline_pattern",
          "layout_recipe",
          "style_tags",
          "forbidden_terms"
        ],
        "properties": {
          "example_id": {
            "type": "string"
          },
          "page_type": {
            "enum": [
              "cover",
              "toc",
              "section_divider",
              "position",
              "analysis",
              "strategy",
              "concept",
              "comparison",
              "masterplan",
              "plan",
              "section",
              "rendering",
              "technical",
              "data",
              "summary"
            ]
          },
          "source": {
            "type": "object",
            "required": [
              "document_id",
              "page",
              "quote"
            ],
            "properties": {
              "document_id": {
                "type": "string"
              },
              "page": {
                "type": "integer",
                "minimum": 1
              },
              "quote": {
                "type": "string",
                "minLength": 1,
                "description": "用于人工追溯的历史原文短引；逐页生成时不得直接发送。"
              }
            }
          },
          "sanitized_template": {
            "type": "string",
            "description": "去除历史项目名称、数字、功能结论后的可迁移表达模板。"
          },
          "rhetorical_pattern": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          },
          "headline_pattern": {
            "type": "string"
          },
          "layout_recipe": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          },
          "style_tags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "forbidden_terms": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "reference_experience": {
      "type": "object",
      "description": "由历史汇报结构化标注生成的安全经验投影。只保存叙事角色、转场和页面配方，不保存历史项目事实、原文或标题候选。",
      "required": [
        "source_document_id",
        "source_documents",
        "source_schema_version",
        "source_page_count",
        "safe_projection_version",
        "narrative_pages",
        "transition_patterns",
        "page_recipes",
        "excluded_fields"
      ],
      "properties": {
        "source_document_id": {
          "type": "string"
        },
        "source_documents": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "source_document_id",
              "display_name",
              "source_page_count",
              "narrative_page_count",
              "recipe_count"
            ],
            "properties": {
              "source_document_id": {
                "type": "string"
              },
              "display_name": {
                "type": "string",
                "minLength": 1
              },
              "source_page_count": {
                "type": "integer",
                "minimum": 1
              },
              "narrative_page_count": {
                "type": "integer",
                "minimum": 1
              },
              "recipe_count": {
                "type": "integer",
                "minimum": 1
              }
            }
          }
        },
        "source_schema_version": {
          "type": "integer",
          "minimum": 1
        },
        "source_page_count": {
          "type": "integer",
          "minimum": 1
        },
        "safe_projection_version": {
          "type": "integer",
          "minimum": 1
        },
        "narrative_pages": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "order",
              "source_document_id",
              "page_number",
              "chapter",
              "page_family",
              "page_type_label",
              "page_role",
              "scheme_branch",
              "reuse_level",
              "reference_quality",
              "can_merge_with_next"
            ],
            "properties": {
              "order": {
                "type": "integer",
                "minimum": 1
              },
              "source_document_id": {
                "type": "string"
              },
              "page_number": {
                "type": "integer",
                "minimum": 1
              },
              "chapter": {
                "type": "string"
              },
              "page_family": {
                "type": "string"
              },
              "page_type_label": {
                "type": "string"
              },
              "page_role": {
                "enum": [
                  "section_divider",
                  "fact_evidence",
                  "problem_definition",
                  "strategy_statement",
                  "design_action",
                  "technical_proof",
                  "visual_showcase"
                ]
              },
              "reuse_level": {
                "enum": [
                  "representative",
                  "supporting",
                  "low"
                ]
              },
              "reference_quality": {
                "type": "string"
              },
              "can_merge_with_next": {
                "type": "boolean"
              },
              "scheme_branch": {
                "enum": [
                  "shared",
                  "one_tower",
                  "two_tower",
                  "comparison"
                ]
              },
              "parallel_step_key": {
                "type": "string"
              }
            }
          }
        },
        "transition_patterns": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "from_role",
              "to_role",
              "source_document_id",
              "count",
              "example_pages"
            ],
            "properties": {
              "from_role": {
                "type": "string"
              },
              "to_role": {
                "type": "string"
              },
              "source_document_id": {
                "type": "string"
              },
              "count": {
                "type": "integer",
                "minimum": 1
              },
              "example_pages": {
                "type": "array",
                "items": {
                  "type": "string",
                  "pattern": "^[0-9]+→[0-9]+$"
                }
              }
            }
          }
        },
        "page_recipes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "recipe_id",
              "source_document_id",
              "page_type_label",
              "canonical_page_type",
              "page_role",
              "scheme_branch",
              "primary_visual",
              "supporting_visuals",
              "needs_drawings",
              "asset_slots",
              "text_weight",
              "layout_hint",
              "source_pages",
              "reuse_level"
            ],
            "properties": {
              "recipe_id": {
                "type": "string"
              },
              "source_document_id": {
                "type": "string"
              },
              "page_type_label": {
                "type": "string"
              },
              "canonical_page_type": {
                "enum": [
                  "cover",
                  "toc",
                  "section_divider",
                  "position",
                  "analysis",
                  "strategy",
                  "concept",
                  "comparison",
                  "masterplan",
                  "plan",
                  "section",
                  "rendering",
                  "technical",
                  "data",
                  "summary"
                ]
              },
              "page_role": {
                "type": "string"
              },
              "primary_visual": {
                "type": "string"
              },
              "supporting_visuals": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "needs_drawings": {
                "type": "boolean"
              },
              "asset_slots": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "slot",
                    "visual_type",
                    "count",
                    "label"
                  ],
                  "properties": {
                    "slot": {
                      "type": "string"
                    },
                    "visual_type": {
                      "type": "string"
                    },
                    "count": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "label": {
                      "type": "string"
                    }
                  }
                }
              },
              "text_weight": {
                "enum": [
                  "low",
                  "medium",
                  "high"
                ]
              },
              "layout_hint": {
                "type": "string"
              },
              "topics": {
                "type": "array",
                "description": "脱敏后的页面主题标签，用于语义检索，不得包含历史项目专名。",
                "items": {
                  "enum": [
                    "identity",
                    "location",
                    "site_context",
                    "constraints",
                    "circulation",
                    "public_space",
                    "program",
                    "massing",
                    "concept",
                    "landscape",
                    "sustainability",
                    "masterplan",
                    "plan",
                    "section",
                    "facade",
                    "structure",
                    "technical",
                    "rendering",
                    "system_rendering",
                    "comparison",
                    "data",
                    "summary",
                    "strategy_overview"
                  ]
                }
              },
              "page_intents": {
                "type": "array",
                "description": "页面承担的叙事任务。",
                "items": {
                  "enum": [
                    "introduce",
                    "orient",
                    "analyze",
                    "define_problem",
                    "state_strategy",
                    "explain_generation",
                    "verify_design",
                    "prove_technical",
                    "showcase",
                    "transition",
                    "summarize"
                  ]
                }
              },
              "evidence_types": {
                "type": "array",
                "description": "页面依赖的证据与素材类型。",
                "items": {
                  "enum": [
                    "text",
                    "map",
                    "analysis_diagram",
                    "concept_diagram",
                    "masterplan",
                    "floor_plan",
                    "section",
                    "elevation",
                    "rendering",
                    "data_table",
                    "photo"
                  ]
                }
              },
              "layout_family": {
                "type": "string",
                "description": "脱敏的布局家族标识，用于全篇避免连续同构。"
              },
              "scheme_branch": {
                "enum": [
                  "shared",
                  "one_tower",
                  "two_tower",
                  "comparison"
                ],
                "description": "多方案样本中的叙事分支；普通样本使用shared。"
              },
              "parallel_step_key": {
                "type": "string",
                "description": "平行方案中承担相同步骤的页面键，用于建立跨方案对应关系。"
              },
              "source_pages": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "integer",
                  "minimum": 1
                }
              },
              "reuse_level": {
                "enum": [
                  "representative",
                  "supporting",
                  "low"
                ]
              }
            }
          }
        },
        "excluded_fields": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "conflicts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "conflict_id",
          "field_path",
          "fact_ids",
          "severity",
          "resolution_status"
        ],
        "properties": {
          "conflict_id": {
            "type": "string"
          },
          "field_path": {
            "type": "string"
          },
          "fact_ids": {
            "type": "array",
            "minItems": 2,
            "items": {
              "type": "string"
            }
          },
          "severity": {
            "enum": [
              "blocking",
              "important",
              "minor"
            ]
          },
          "resolution_status": {
            "enum": [
              "unresolved",
              "resolved",
              "accepted_difference"
            ]
          },
          "resolution_note": {
            "type": "string"
          }
        }
      }
    },
    "missing_items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "item_id",
          "description",
          "severity",
          "blocks"
        ],
        "properties": {
          "item_id": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "severity": {
            "enum": [
              "blocking",
              "important",
              "optional"
            ]
          },
          "blocks": {
            "type": "array",
            "items": {
              "enum": [
                "planner",
                "page_generation",
                "consistency_review"
              ]
            }
          },
          "suggested_source": {
            "type": "string"
          }
        }
      }
    },
    "gate_b_proposals": {
      "type": "array",
      "description": "针对 Gate B 缺口生成并由用户确认的设计方向。它们是设计决策，不属于带原文出处的项目事实。",
      "items": {
        "type": "object",
        "required": [
          "missing_item_id",
          "missing_label",
          "status",
          "question",
          "task_brief_fact_refs",
          "options",
          "selected_option_id",
          "user_input",
          "confirmed_direction"
        ],
        "properties": {
          "missing_item_id": {
            "type": "string"
          },
          "missing_label": {
            "type": "string"
          },
          "origin": {
            "enum": [
              "agent_missing",
              "user_created"
            ],
            "description": "agent_missing 来自 Agent 的完整度检查；user_created 是用户主动定义的设计提案。"
          },
          "user_defined_title": {
            "type": "string"
          },
          "target_page_types": {
            "type": "array",
            "items": {
              "enum": [
                "cover",
                "toc",
                "section_divider",
                "position",
                "analysis",
                "strategy",
                "concept",
                "comparison",
                "masterplan",
                "plan",
                "section",
                "rendering",
                "technical",
                "data",
                "summary"
              ]
            }
          },
          "created_at": {
            "type": "string"
          },
          "status": {
            "enum": [
              "awaiting_choice",
              "selected",
              "user_defined",
              "confirmed"
            ]
          },
          "question": {
            "type": "string"
          },
          "task_brief_fact_refs": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "options": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "object",
              "required": [
                "option_id",
                "title",
                "summary",
                "design_moves",
                "rationale",
                "task_brief_fact_refs",
                "assumptions",
                "validation_needed"
              ],
              "properties": {
                "option_id": {
                  "type": "string"
                },
                "title": {
                  "type": "string"
                },
                "summary": {
                  "type": "string"
                },
                "design_moves": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "string"
                  }
                },
                "rationale": {
                  "type": "string"
                },
                "task_brief_fact_refs": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "assumptions": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "validation_needed": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          },
          "selected_option_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "user_input": {
            "type": "string"
          },
          "confirmed_direction": {
            "type": "string"
          }
        }
      }
    },
    "gate_report": {
      "type": "object",
      "required": [
        "planner_readiness",
        "generation_readiness",
        "gate_a_missing",
        "gate_b_missing"
      ],
      "properties": {
        "planner_readiness": {
          "enum": [
            "ready",
            "partial",
            "blocked"
          ]
        },
        "generation_readiness": {
          "enum": [
            "ready",
            "partial",
            "blocked"
          ]
        },
        "gate_a_missing": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "gate_b_missing": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "summary": {
          "type": "string"
        }
      }
    }
  }
} as const;

export const pagePlanSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DesignReportPagePlan",
  "type": "object",
  "required": [
    "narrative_claim",
    "page_format",
    "sections",
    "pages"
  ],
  "properties": {
    "narrative_claim": {
      "type": "string",
      "description": "全篇只保留一个中心主张。"
    },
    "task_mode": {
      "enum": [
        "large_public_building",
        "small_building_or_interior"
      ],
      "default": "large_public_building",
      "description": "页面排版与生成管线所属模式。小型建筑/装置管线不使用大型公共建筑的历史参考页型。"
    },
    "page_format": {
      "const": "A3_landscape_420x297mm"
    },
    "language_mode": {
      "enum": [
        "zh",
        "zh_en"
      ],
      "default": "zh_en"
    },
    "target_page_count": {
      "type": "integer",
      "minimum": 1,
      "default": 50
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "section_id",
          "title_zh",
          "purpose"
        ],
        "properties": {
          "section_id": {
            "type": "string"
          },
          "title_zh": {
            "type": "string"
          },
          "title_en": {
            "type": "string"
          },
          "purpose": {
            "type": "string"
          },
          "answers_question": {
            "type": "string"
          }
        }
      }
    },
    "pages": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "page_id",
          "section_id",
          "page_type",
          "core_message",
          "headline_zh",
          "body_copy",
          "diagram_labels",
          "speaker_notes",
          "visual_requirements",
          "fact_refs",
          "missing_information",
          "generation_status"
        ],
        "properties": {
          "page_id": {
            "type": "string"
          },
          "display_page_number": {
            "type": [
              "integer",
              "null"
            ]
          },
          "section_id": {
            "type": "string"
          },
          "page_type": {
            "enum": [
              "cover",
              "toc",
              "section_divider",
              "position",
              "analysis",
              "strategy",
              "concept",
              "comparison",
              "masterplan",
              "plan",
              "section",
              "rendering",
              "technical",
              "data",
              "summary"
            ]
          },
          "core_message": {
            "type": "string",
            "description": "本页唯一结论。"
          },
          "core_message_en": {
            "type": "string",
            "description": "本页唯一结论的英文翻译，用于中英双语页面与 PDF。"
          },
          "headline_zh": {
            "type": "string",
            "description": "主要显示标题，必须使用简体中文。"
          },
          "headline_en": {
            "type": "string",
            "description": "英文标题；中英双语页面与 PDF 必须显示。"
          },
          "body_zh": {
            "type": "string",
            "description": "中文页面正文，必须使用简体中文。"
          },
          "body_en": {
            "type": "string",
            "description": "英文正文；中英双语页面与 PDF 必须显示。"
          },
          "body_copy": {
            "type": "string",
            "description": "当前版本用于页面显示的简体中文正文；一次只生成一页。"
          },
          "content_depth_check": {
            "type": "object",
            "description": "依据单页最低内容标准生成的可重复审核结果。封面、目录和章节页不参与正文深度审核。",
            "required": [
              "status",
              "applicable",
              "evaluated_at",
              "conclusion_present",
              "body_point_count",
              "evidence_count",
              "image_caption_count",
              "required_image_caption_count",
              "confirmed_proposal_count",
              "unsupported_numbers",
              "issues"
            ],
            "properties": {
              "status": {
                "enum": [
                  "pass",
                  "needs_improvement"
                ]
              },
              "applicable": {
                "type": "boolean"
              },
              "evaluated_at": {
                "type": "string"
              },
              "conclusion_present": {
                "type": "boolean"
              },
              "body_point_count": {
                "type": "integer",
                "minimum": 0
              },
              "evidence_count": {
                "type": "integer",
                "minimum": 0
              },
              "image_caption_count": {
                "type": "integer",
                "minimum": 0
              },
              "required_image_caption_count": {
                "type": "integer",
                "minimum": 0
              },
              "confirmed_proposal_count": {
                "type": "integer",
                "minimum": 0
              },
              "unsupported_numbers": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "issues": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          },
          "diagram_labels": {
            "type": "array",
            "description": "页面直接显示的中文图解标签；专业缩写可保留英文。",
            "items": {
              "type": "string"
            }
          },
          "diagram_labels_en": {
            "type": "array",
            "description": "与 diagram_labels 按顺序对应的英文图解标签。",
            "items": {
              "type": "string"
            }
          },
          "speaker_notes": {
            "type": "string",
            "description": "中文讲述提示。"
          },
          "visual_requirements": {
            "type": "array",
            "description": "中文视觉要求。",
            "items": {
              "type": "string"
            }
          },
          "callouts": {
            "type": "array",
            "maxItems": 8,
            "items": {
              "type": "object",
              "required": [
                "label_zh"
              ],
              "properties": {
                "label_zh": {
                  "type": "string",
                  "description": "页面主要显示的中文标签。"
                },
                "label_en": {
                  "type": "string",
                  "description": "英文标签；中英双语页面与 PDF 必须显示。"
                },
                "fact_ref": {
                  "type": "string"
                }
              }
            }
          },
          "visual_brief": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "style_example_refs": {
            "type": "array",
            "description": "本页匹配的历史风格样本编号，只用于文字结构与版式指导。",
            "items": {
              "type": "string"
            }
          },
          "experience_recipe_refs": {
            "type": "array",
            "description": "本页匹配的结构化历史页面配方编号，只用于叙事角色、素材槽位与版式指导。",
            "items": {
              "type": "string"
            }
          },
          "visual_task": {
            "type": "object",
            "description": "围绕当前项目证据生成的单页视觉任务单及多轮确认记录。历史样本只提供版式与图解组织方式。",
            "required": [
              "page_id",
              "status",
              "objective",
              "production_mode",
              "primary_visual",
              "visual_intent",
              "image_slots",
              "available_inputs",
              "missing_inputs",
              "generation_steps",
              "constraints",
              "ai_generation_policy",
              "reference_recipe_refs",
              "visual_reference_refs",
              "conversation"
            ],
            "properties": {
              "page_id": {
                "type": "string"
              },
              "status": {
                "enum": [
                  "draft",
                  "awaiting_choice",
                  "awaiting_materials",
                  "ready",
                  "approved"
                ]
              },
              "objective": {
                "type": "string"
              },
              "production_mode": {
                "enum": [
                  "source_rework",
                  "diagram",
                  "concept_sequence",
                  "render_direction",
                  "mixed"
                ]
              },
              "primary_visual": {
                "type": "string"
              },
              "frame_layout": {
                "description": "由页面内容关系确定并锁定的图片槽编排。后续改文案、换参考图或 AI 生图不得改变该值。",
                "enum": [
                  "single",
                  "row",
                  "lead_top",
                  "lead_left",
                  "two_by_two",
                  "two_by_three"
                ]
              },
              "visual_intent": {
                "type": "object",
                "description": "从本页核心结论、叙事关系和当前项目证据出发形成的第一性视觉需求判断。它直接指导参考素材检索和 Graphic 生成，不是供用户选择的风格选项。",
                "required": [
                  "conclusion_to_prove",
                  "relationship_to_show",
                  "evidence_needed",
                  "graphic_elements",
                  "search_focus",
                  "layout_logic"
                ],
                "properties": {
                  "conclusion_to_prove": {
                    "type": "string",
                    "minLength": 1
                  },
                  "relationship_to_show": {
                    "enum": [
                      "sequence",
                      "comparison",
                      "hierarchy",
                      "spatial_relationship",
                      "evidence_mapping",
                      "atmosphere",
                      "index"
                    ]
                  },
                  "evidence_needed": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 8,
                    "items": {
                      "type": "string"
                    }
                  },
                  "graphic_elements": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 8,
                    "items": {
                      "type": "string"
                    }
                  },
                  "search_focus": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 8,
                    "items": {
                      "type": "string"
                    }
                  },
                  "layout_logic": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              },
              "image_slots": {
                "type": "array",
                "description": "当前页面实际需要填充的独立图片槽。每个槽对应一个明确的内容任务；多步骤、多方案页面不得把一张图重复铺入多个槽。",
                "maxItems": 6,
                "items": {
                  "type": "object",
                  "required": [
                    "slot_id",
                    "label",
                    "purpose",
                    "prompt_focus",
                    "aspect_ratio"
                  ],
                  "properties": {
                    "slot_id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "label": {
                      "type": "string",
                      "minLength": 1
                    },
                    "purpose": {
                      "type": "string",
                      "minLength": 1
                    },
                    "prompt_focus": {
                      "type": "string",
                      "minLength": 1
                    },
                    "aspect_ratio": {
                      "enum": [
                        "wide",
                        "landscape",
                        "square",
                        "portrait"
                      ]
                    }
                  }
                }
              },
              "available_inputs": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "missing_inputs": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "generation_steps": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "string"
                }
              },
              "constraints": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "ai_generation_policy": {
                "type": "string"
              },
              "reference_recipe_refs": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "visual_reference_refs": {
                "type": "array",
                "description": "本页从精选视觉参考库宽召回的内部候选编号。只供模型语义复排，不得作为前台候选列表显示。",
                "items": {
                  "type": "string"
                }
              },
              "reference_selection": {
                "type": "object",
                "description": "文本大模型根据本页第一性视觉需求、证据类型和当前项目素材，对宽召回结果进行语义复排后的内部选择记录。不得在前台显示选择理由、置信度或候选清单。",
                "required": [
                  "status",
                  "selection_method",
                  "selected_visual_id",
                  "confidence",
                  "internal_rationale",
                  "evaluated_at"
                ],
                "properties": {
                  "status": {
                    "enum": [
                      "matched",
                      "no_suitable_reference"
                    ]
                  },
                  "selection_method": {
                    "const": "model_semantic_rerank"
                  },
                  "selected_visual_id": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "internal_rationale": {
                    "type": "string"
                  },
                  "evaluated_at": {
                    "type": "string"
                  }
                }
              },
              "draft_output": {
                "type": "object",
                "description": "系统理解本页视觉需求后自动生成的可见 A3 构图草案。它是结构预览，不冒充最终效果图或已完成图纸。",
                "required": [
                  "status",
                  "title",
                  "format",
                  "description",
                  "zones",
                  "prompt_zh",
                  "disclaimer"
                ],
                "properties": {
                  "status": {
                    "enum": [
                      "conceptual",
                      "material_ready"
                    ]
                  },
                  "title": {
                    "type": "string"
                  },
                  "format": {
                    "enum": [
                      "diagram_wireframe",
                      "drawing_rework_plan",
                      "concept_sequence",
                      "render_shot_list"
                    ]
                  },
                  "description": {
                    "type": "string"
                  },
                  "zones": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 6,
                    "items": {
                      "type": "object",
                      "required": [
                        "zone_id",
                        "label",
                        "content",
                        "evidence_refs"
                      ],
                      "properties": {
                        "zone_id": {
                          "type": "string"
                        },
                        "label": {
                          "type": "string"
                        },
                        "content": {
                          "type": "string"
                        },
                        "evidence_refs": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "prompt_zh": {
                    "type": "string"
                  },
                  "disclaimer": {
                    "type": "string"
                  }
                }
              },
              "reference_crop": {
                "type": "object",
                "description": "兼容旧数据的首张素材库裁剪图。新页面以 slot_reference_crops 作为各图片槽的唯一素材库映射依据。",
                "required": [
                  "status",
                  "visual_id",
                  "image_url",
                  "background_position",
                  "crop_zoom",
                  "selected_at"
                ],
                "properties": {
                  "status": {
                    "const": "selected"
                  },
                  "visual_id": {
                    "type": "string"
                  },
                  "image_url": {
                    "type": "string",
                    "pattern": "^/reference-library/"
                  },
                  "background_position": {
                    "type": "string"
                  },
                  "crop_zoom": {
                    "type": "number",
                    "minimum": 1,
                    "maximum": 1.6
                  },
                  "selected_at": {
                    "type": "string"
                  }
                }
              },
              "slot_reference_crops": {
                "type": "array",
                "description": "由文本大模型从精选视觉素材库为达到匹配阈值的图片槽分别选择的原始参考图。未达到阈值的槽保持空白，不得用第一张候选强制补位；用户只能针对已有参考的一个 slot_id 单独发起 AI 重生成。",
                "minItems": 1,
                "maxItems": 6,
                "items": {
                  "type": "object",
                  "required": [
                    "slot_id",
                    "status",
                    "visual_id",
                    "image_url",
                    "background_position",
                    "crop_zoom",
                    "selected_at"
                  ],
                  "properties": {
                    "slot_id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "status": {
                      "const": "selected"
                    },
                    "visual_id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "image_url": {
                      "type": "string",
                      "pattern": "^/reference-library/"
                    },
                    "background_position": {
                      "type": "string"
                    },
                    "crop_zoom": {
                      "type": "number",
                      "minimum": 1,
                      "maximum": 1.6
                    },
                    "selected_at": {
                      "type": "string"
                    }
                  }
                }
              },
              "image_prompt": {
                "type": "object",
                "description": "文本模型返回的后台提示词导演草稿与元数据。它用于后台组装最终生图请求，不等于实际提交给图像模型的完整提示词，也不得作为汇报正文显示。",
                "required": [
                  "prompt_zh",
                  "negative_prompt_zh",
                  "visual_type",
                  "aspect_ratio",
                  "style_keywords"
                ],
                "properties": {
                  "prompt_zh": {
                    "type": "string",
                    "description": "文本模型返回的后台提示词草稿；不是图像接口最终收到的完整提示词。",
                    "minLength": 1
                  },
                  "negative_prompt_zh": {
                    "type": "string",
                    "description": "文本模型返回的后台负向提示词草稿；最终提交值可能由系统追加边界规则。"
                  },
                  "visual_type": {
                    "type": "string"
                  },
                  "aspect_ratio": {
                    "type": "string",
                    "minLength": 3,
                    "description": "当前被选中图片槽的实际宽高比，格式为宽:高；不是整张 A3 页面的比例。"
                  },
                  "style_keywords": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 12,
                    "items": {
                      "type": "string"
                    }
                  }
                }
              },
              "generated_image": {
                "type": "object",
                "description": "兼容旧数据的首张低分辨率意向参考图。新页面以 generated_images 作为各图片槽的唯一映射依据。",
                "required": [
                  "status",
                  "model",
                  "size",
                  "image_url",
                  "generated_at",
                  "provider_response_id",
                  "image_count",
                  "disclaimer"
                ],
                "properties": {
                  "status": {
                    "const": "generated"
                  },
                  "model": {
                    "type": "string"
                  },
                  "prompt_zh": {
                    "type": "string",
                    "description": "本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。",
                    "minLength": 1
                  },
                  "submitted_prompt_zh": {
                    "type": "string",
                    "description": "图像接口请求中实际提交的完整中文提示文本，包含系统追加的参考图、边界和负向约束语义；这是提示词审计的规范字段。",
                    "minLength": 1
                  },
                  "submitted_negative_prompt_zh": {
                    "type": "string",
                    "description": "本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。"
                  },
                  "prompt_provenance": {
                    "const": "submitted_to_image_model",
                    "description": "明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。"
                  },
                  "size": {
                    "type": "string"
                  },
                  "image_url": {
                    "type": "string",
                    "minLength": 1
                  },
                  "generated_at": {
                    "type": "string"
                  },
                  "provider_response_id": {
                    "type": "string"
                  },
                  "image_count": {
                    "type": "integer",
                    "minimum": 1
                  },
                  "attempt_count": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 6,
                    "description": "本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。"
                  },
                  "reference_guidance": {
                    "type": "object",
                    "description": "本次图像生成实际使用的精选视觉参考图。仅用于构图层级、留白、视觉节奏和 graphic 语言引导，不得复制历史项目内容。",
                    "required": [
                      "visual_id",
                      "image_url",
                      "usage_scope"
                    ],
                    "properties": {
                      "visual_id": {
                        "type": "string",
                        "minLength": 1
                      },
                      "image_url": {
                        "type": "string",
                        "pattern": "^/reference-library/"
                      },
                      "usage_scope": {
                        "const": "composition_hierarchy_style_only"
                      }
                    }
                  },
                  "disclaimer": {
                    "type": "string"
                  }
                }
              },
              "generated_images": {
                "type": "array",
                "description": "图像模型按 image_slots 分别生成的低分辨率图片素材，可包含少量必要标签。每张图只能填入 slot_id 指定的图框。",
                "minItems": 1,
                "maxItems": 6,
                "items": {
                  "type": "object",
                  "required": [
                    "slot_id",
                    "prompt_focus",
                    "status",
                    "model",
                    "size",
                    "image_url",
                    "generated_at",
                    "provider_response_id",
                    "image_count",
                    "disclaimer"
                  ],
                  "properties": {
                    "slot_id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "prompt_focus": {
                      "type": "string",
                      "minLength": 1
                    },
                    "status": {
                      "const": "generated"
                    },
                    "model": {
                      "type": "string"
                    },
                    "prompt_zh": {
                      "type": "string",
                      "description": "本张图片实际提交给图像模型的完整中文提示词。仅在用户主动生成图片后，作为生成记录向用户展示。",
                      "minLength": 1
                    },
                    "submitted_prompt_zh": {
                      "type": "string",
                      "description": "图像接口请求中实际提交的完整中文提示文本；这是提示词审计的规范字段。",
                      "minLength": 1
                    },
                    "submitted_negative_prompt_zh": {
                      "type": "string",
                      "description": "本次请求实际使用的负向提示词值；旧记录缺少该字段时不得推断。"
                    },
                    "prompt_provenance": {
                      "const": "submitted_to_image_model",
                      "description": "明确证明 prompt_zh 是实际发送给图像模型的最终提示词，而不是提示词导演摘要、视觉任务说明或后台结构化返回。旧记录缺少此字段时不得在界面中冒充最终提交提示词。"
                    },
                    "size": {
                      "type": "string"
                    },
                    "image_url": {
                      "type": "string",
                      "minLength": 1
                    },
                    "generated_at": {
                      "type": "string"
                    },
                    "provider_response_id": {
                      "type": "string"
                    },
                    "image_count": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "attempt_count": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 6,
                      "description": "本张图片实际向图像模型发起的请求次数；小型建筑/装置管线最多三轮恢复，每轮模型内部最多请求两次。"
                    },
                    "reference_guidance": {
                      "type": "object",
                      "required": [
                        "visual_id",
                        "image_url",
                        "usage_scope"
                      ],
                      "properties": {
                        "visual_id": {
                          "type": "string",
                          "minLength": 1
                        },
                        "image_url": {
                          "type": "string",
                          "pattern": "^/reference-library/"
                        },
                        "usage_scope": {
                          "const": "composition_hierarchy_style_only"
                        }
                      }
                    },
                    "disclaimer": {
                      "type": "string"
                    }
                  }
                }
              },
              "conversation": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "round",
                    "role",
                    "content"
                  ],
                  "properties": {
                    "round": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "role": {
                      "enum": [
                        "user",
                        "assistant"
                      ]
                    },
                    "content": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "fact_refs": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "proposal_refs": {
            "type": "array",
            "description": "本页实际采用的已确认 Gate B 提案编号。仅用于设计决策追踪，不得伪装成任务书事实。",
            "items": {
              "type": "string"
            }
          },
          "proposal_coverage": {
            "type": "array",
            "description": "记录每项已确认提案如何实质进入本页可见文案。visible_statement 必须逐字出现在正文、图解标签或标注中。",
            "items": {
              "type": "object",
              "required": [
                "proposal_id",
                "visible_statement",
                "applied_design_moves"
              ],
              "properties": {
                "proposal_id": {
                  "type": "string"
                },
                "visible_statement": {
                  "type": "string",
                  "minLength": 1
                },
                "applied_design_moves": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          },
          "proposal_context_hash": {
            "type": "string",
            "description": "本页最近一次同步的已确认提案上下文指纹，用于在提案变化后使旧文案失效。"
          },
          "unresolved_items": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "missing_information": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "generation_status": {
            "enum": [
              "ready",
              "placeholder",
              "blocked",
              "generated",
              "reviewed"
            ]
          }
        }
      }
    },
    "audit_report": {
      "type": "object",
      "required": [
        "reviewed_page_ids",
        "issues",
        "summary"
      ],
      "properties": {
        "reviewed_page_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "issues": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "severity",
              "pages",
              "issue",
              "evidence",
              "fact_refs",
              "recommended_fix"
            ],
            "properties": {
              "severity": {
                "enum": [
                  "blocking",
                  "major",
                  "minor"
                ]
              },
              "pages": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "issue": {
                "type": "string"
              },
              "evidence": {
                "type": "string"
              },
              "fact_refs": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "recommended_fix": {
                "type": "string"
              }
            }
          }
        },
        "summary": {
          "type": "string"
        }
      }
    }
  }
} as const;

export const designNarrativeSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DesignReportNarrative",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "document_title_zh",
    "document_subtitle_zh",
    "source_scope_note",
    "executive_concept",
    "chapters",
    "value_summary",
    "coverage"
  ],
  "properties": {
    "document_title_zh": {
      "type": "string",
      "minLength": 1
    },
    "document_subtitle_zh": {
      "type": "string",
      "minLength": 1
    },
    "source_scope_note": {
      "type": "string",
      "minLength": 1
    },
    "executive_concept": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "statement_zh",
        "keywords_zh",
        "fact_refs",
        "proposal_refs",
        "page_refs"
      ],
      "properties": {
        "statement_zh": {
          "type": "string",
          "minLength": 60
        },
        "keywords_zh": {
          "type": "array",
          "minItems": 3,
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "fact_refs": {
          "$ref": "#/$defs/idList"
        },
        "proposal_refs": {
          "$ref": "#/$defs/idList"
        },
        "page_refs": {
          "$ref": "#/$defs/idList"
        }
      }
    },
    "chapters": {
      "type": "array",
      "minItems": 8,
      "maxItems": 10,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "chapter_id",
          "order",
          "title_zh",
          "lead_zh",
          "subsections",
          "fact_refs",
          "proposal_refs",
          "page_refs"
        ],
        "properties": {
          "chapter_id": {
            "type": "string",
            "pattern": "^N[0-9]{2}$"
          },
          "order": {
            "type": "integer",
            "minimum": 1,
            "maximum": 99
          },
          "title_zh": {
            "type": "string",
            "minLength": 1
          },
          "lead_zh": {
            "type": "string",
            "minLength": 30
          },
          "subsections": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "heading_zh",
                "paragraphs_zh",
                "bullet_points_zh",
                "fact_refs",
                "proposal_refs",
                "page_refs"
              ],
              "properties": {
                "heading_zh": {
                  "type": "string",
                  "minLength": 1
                },
                "paragraphs_zh": {
                  "type": "array",
                  "minItems": 1,
                  "maxItems": 2,
                  "items": {
                    "type": "string",
                    "minLength": 30
                  }
                },
                "bullet_points_zh": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 4
                  }
                },
                "fact_refs": {
                  "$ref": "#/$defs/idList"
                },
                "proposal_refs": {
                  "$ref": "#/$defs/idList"
                },
                "page_refs": {
                  "$ref": "#/$defs/idList"
                }
              }
            }
          },
          "fact_refs": {
            "$ref": "#/$defs/idList"
          },
          "proposal_refs": {
            "$ref": "#/$defs/idList"
          },
          "page_refs": {
            "$ref": "#/$defs/idList"
          }
        }
      }
    },
    "value_summary": {
      "type": "array",
      "minItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "label_zh",
          "statement_zh",
          "fact_refs",
          "proposal_refs",
          "page_refs"
        ],
        "properties": {
          "label_zh": {
            "type": "string",
            "minLength": 1
          },
          "statement_zh": {
            "type": "string",
            "minLength": 20
          },
          "fact_refs": {
            "$ref": "#/$defs/idList"
          },
          "proposal_refs": {
            "$ref": "#/$defs/idList"
          },
          "page_refs": {
            "$ref": "#/$defs/idList"
          }
        }
      }
    },
    "coverage": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "source_document_ids",
        "fact_refs",
        "proposal_refs",
        "page_refs",
        "known_gaps"
      ],
      "properties": {
        "source_document_ids": {
          "$ref": "#/$defs/idList"
        },
        "fact_refs": {
          "$ref": "#/$defs/idList"
        },
        "proposal_refs": {
          "$ref": "#/$defs/idList"
        },
        "page_refs": {
          "$ref": "#/$defs/idList"
        },
        "known_gaps": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  },
  "$defs": {
    "idList": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "string",
        "minLength": 1
      }
    }
  }
} as const;

export const visualReferenceLibrarySchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DesignReportVisualReferenceLibrary",
  "type": "object",
  "required": [
    "library_id",
    "version",
    "source_documents",
    "selection_method",
    "entries"
  ],
  "properties": {
    "library_id": {
      "type": "string"
    },
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "source_documents": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "source_document_id",
          "display_name",
          "source_page_count",
          "selected_page_count"
        ],
        "properties": {
          "source_document_id": {
            "type": "string"
          },
          "display_name": {
            "type": "string"
          },
          "source_page_count": {
            "type": "integer",
            "minimum": 1
          },
          "selected_page_count": {
            "type": "integer",
            "minimum": 1
          }
        }
      }
    },
    "selection_method": {
      "type": "object",
      "required": [
        "target_count",
        "criteria"
      ],
      "properties": {
        "target_count": {
          "type": "integer",
          "minimum": 1
        },
        "criteria": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "entries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "visual_id",
          "source_document_id",
          "source_page",
          "image_path",
          "graphic_crop_path",
          "graphic_crop_width",
          "graphic_crop_height",
          "graphic_crop_box",
          "graphic_crop_source",
          "crop_quality",
          "thumbnail_width",
          "thumbnail_height",
          "dominant_colors",
          "brightness",
          "edge_density",
          "page_type",
          "page_role",
          "scheme_branch",
          "topics",
          "page_intents",
          "visual_type",
          "evidence_types",
          "layout_family",
          "required_current_assets",
          "recipe_refs",
          "quality",
          "retrieval_text",
          "safe_use_guidance"
        ],
        "properties": {
          "visual_id": {
            "type": "string"
          },
          "source_document_id": {
            "type": "string"
          },
          "source_page": {
            "type": "integer",
            "minimum": 1
          },
          "image_path": {
            "type": "string",
            "pattern": "^/reference-library/"
          },
          "graphic_crop_path": {
            "type": "string",
            "pattern": "^/reference-library/crops/"
          },
          "graphic_crop_width": {
            "type": "integer",
            "minimum": 1
          },
          "graphic_crop_height": {
            "type": "integer",
            "minimum": 1
          },
          "graphic_crop_box": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {
              "type": "integer",
              "minimum": 0
            }
          },
          "graphic_crop_source": {
            "enum": [
              "embedded_image",
              "rendered_component"
            ]
          },
          "crop_quality": {
            "type": "object",
            "description": "裁图后的自动质量检测。低质量素材不会进入运行时匹配候选。",
            "required": [
              "score",
              "accepted",
              "blank_ratio",
              "text_ratio",
              "effective_area_ratio",
              "sharpness",
              "rejection_reasons"
            ],
            "properties": {
              "score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "accepted": {
                "type": "boolean"
              },
              "blank_ratio": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "text_ratio": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "effective_area_ratio": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "sharpness": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "rejection_reasons": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          },
          "thumbnail_width": {
            "type": "integer",
            "minimum": 1
          },
          "thumbnail_height": {
            "type": "integer",
            "minimum": 1
          },
          "dominant_colors": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": {
              "type": "string",
              "pattern": "^#[0-9A-Fa-f]{6}$"
            }
          },
          "brightness": {
            "enum": [
              "light",
              "balanced",
              "dark"
            ]
          },
          "edge_density": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "page_type": {
            "enum": [
              "cover",
              "toc",
              "section_divider",
              "position",
              "analysis",
              "strategy",
              "concept",
              "comparison",
              "masterplan",
              "plan",
              "section",
              "rendering",
              "technical",
              "data",
              "summary"
            ]
          },
          "page_role": {
            "enum": [
              "section_divider",
              "fact_evidence",
              "problem_definition",
              "strategy_statement",
              "design_action",
              "technical_proof",
              "visual_showcase"
            ]
          },
          "scheme_branch": {
            "enum": [
              "shared",
              "one_tower",
              "two_tower",
              "comparison"
            ]
          },
          "topics": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "page_intents": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "visual_type": {
            "type": "string"
          },
          "evidence_types": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "layout_family": {
            "type": "string"
          },
          "required_current_assets": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "recipe_refs": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          },
          "quality": {
            "enum": [
              "featured",
              "supporting"
            ]
          },
          "retrieval_text": {
            "type": "string"
          },
          "safe_use_guidance": {
            "type": "string"
          }
        }
      }
    }
  }
} as const;

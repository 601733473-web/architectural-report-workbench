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
              "proposal_fact"
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
      "minimum": 1
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
          "headline_zh": {
            "type": "string"
          },
          "headline_en": {
            "type": "string"
          },
          "body_zh": {
            "type": "string"
          },
          "body_en": {
            "type": "string"
          },
          "body_copy": {
            "type": "string",
            "description": "当前版本的中文页面正文；一次只生成一页。"
          },
          "diagram_labels": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "speaker_notes": {
            "type": "string"
          },
          "visual_requirements": {
            "type": "array",
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
                  "type": "string"
                },
                "label_en": {
                  "type": "string"
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
          "fact_refs": {
            "type": "array",
            "items": {
              "type": "string"
            }
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

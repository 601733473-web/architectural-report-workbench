"use client";

import {
  AlertTriangle,
  BookOpenText,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardPaste,
  Download,
  FileSearch,
  FileText,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { fileToInputDocument } from "@/app/lib/pdf-client";
import { isDefaultReference } from "@/app/lib/default-reference";
import type {
  InputDocument,
  NodeOutput,
  PipelineResult,
  SourceRole,
} from "@/app/lib/pipeline";

type LeftTab = "documents" | "facts" | "issues";

interface WorkbenchProps {
  initialDocuments: InputDocument[];
  initialResult: PipelineResult;
}

const roleLabels: Record<SourceRole, string> = {
  authoritative: "权威资料",
  proposal: "方案资料",
  reference_style: "风格参考",
  company_info: "公司信息",
  unknown: "待判断",
};

const statusLabels: Record<string, string> = {
  ready: "可生成",
  placeholder: "占位",
  blocked: "阻断",
  generated: "已生成",
  reviewed: "已审核",
};

const pageTypeLabels: Record<string, string> = {
  cover: "封面",
  toc: "目录",
  section_divider: "章节",
  position: "区位",
  analysis: "分析",
  strategy: "策略",
  concept: "概念",
  comparison: "比选",
  masterplan: "总图",
  plan: "图纸",
  section: "剖面",
  rendering: "效果",
  technical: "技术",
  data: "数据",
  summary: "总结",
};

async function callPipeline(body: unknown) {
  const response = await fetch("/api/pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "处理失败");
  }
  return data as PipelineResult;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status] ?? status}
    </span>
  );
}

function GatePill({
  label,
  status,
}: {
  label: string;
  status?: string;
}) {
  return (
    <div className={`gate-pill gate-${status ?? "waiting"}`}>
      {status === "ready" ? <Check size={13} /> : <CircleDot size={13} />}
      <span>{label}</span>
      <strong>
        {!status
          ? "待开始"
          : status === "ready"
            ? "通过"
            : status === "partial"
              ? "部分"
              : "阻断"}
      </strong>
    </div>
  );
}

function FieldLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="field-label">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function documentTextLength(document: InputDocument) {
  return document.text
    .replace(/={3,}\s*PAGE\s+\d+\s*={3,}/gi, "")
    .trim().length;
}

function DocumentCard({
  document,
  locked,
  onRoleChange,
  onRemove,
}: {
  document: InputDocument;
  locked?: boolean;
  onRoleChange: (documentId: string, role: SourceRole) => void;
  onRemove: (documentId: string) => void;
}) {
  const textLength = documentTextLength(document);
  return (
    <article
      className={`document-card ${locked ? "system-document" : ""}`}
      key={document.document_id}
    >
      <div className="document-icon">
        <FileText size={17} />
      </div>
      <div className="document-main">
        <div className="document-title" title={document.file_name}>
          {document.file_name}
          {locked ? <span className="system-badge">系统内置</span> : null}
        </div>
        <div className="document-meta">
          {document.page_count ?? 1} 页 ·{" "}
          {locked ? "已提取结构与版式档案" : `已读取 ${textLength.toLocaleString()} 字`}
        </div>
        {!locked && textLength < 30 ? (
          <div className="pdf-text-warning">
            未读到有效文字层；扫描 PDF 需要 OCR。
          </div>
        ) : (
          <details className="text-preview">
            <summary>{locked ? "查看参考档案" : "查看识别文本"}</summary>
            <pre>{document.text.slice(0, 1200)}</pre>
          </details>
        )}
        {locked ? (
          <div className="locked-role">历史参考 · 只影响结构与表达风格</div>
        ) : (
          <select
            className={`role-select role-${document.role}`}
            value={document.role}
            onChange={(event) =>
              onRoleChange(
                document.document_id,
                event.target.value as SourceRole,
              )
            }
            aria-label={`${document.file_name}角色`}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      {!locked ? (
        <button
          className="remove-button"
          onClick={() => onRemove(document.document_id)}
          aria-label={`移除${document.file_name}`}
        >
          <X size={14} />
        </button>
      ) : null}
    </article>
  );
}

export function Workbench({
  initialDocuments,
  initialResult,
}: WorkbenchProps) {
  const [documents, setDocuments] =
    useState<InputDocument[]>(initialDocuments);
  const [result, setResult] = useState<PipelineResult>(initialResult);
  const [leftTab, setLeftTab] = useState<LeftTab>("documents");
  const [selectedPageId, setSelectedPageId] = useState(
    initialResult.projectFacts.facts.length
      ? initialResult.pagePlan.pages[0]?.page_id
      : undefined,
  );
  const [pastedText, setPastedText] = useState("");
  const [pasteRole, setPasteRole] = useState<SourceRole>("authoritative");
  const [showPaste, setShowPaste] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [documentsChanged, setDocumentsChanged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const facts = result.projectFacts;
  const plan = result.pagePlan;
  const projectDocuments = documents.filter(
    (document) => document.role !== "reference_style",
  );
  const referenceDocuments = documents.filter(
    (document) => document.role === "reference_style",
  );
  const hasProjectSource = projectDocuments.some((document) =>
    ["authoritative", "proposal"].includes(document.role),
  );
  const selectedPage = plan.pages.find(
    (page) => page.page_id === selectedPageId,
  );
  const selectedFacts = useMemo(
    () =>
      (selectedPage?.fact_refs ?? [])
        .map((factId) => facts.facts.find((fact) => fact.fact_id === factId))
        .filter(Boolean) as DesignReportProjectFacts["facts"],
    [facts.facts, selectedPage],
  );

  const processDocuments = async (nextDocuments: InputDocument[]) => {
    setBusy("run");
    setError("");
    try {
      const next = await callPipeline({
        action: "run",
        projectId: "SINGLE_PROJECT",
        documents: nextDocuments,
      });
      setResult(next);
      setSelectedPageId(next.pagePlan.pages[0]?.page_id);
      setDocumentsChanged(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运行失败");
    } finally {
      setBusy(null);
    }
  };

  const run = () => processDocuments(documents);

  const generatePage = async () => {
    if (!selectedPage) return;
    setBusy("generate");
    setError("");
    try {
      const next = await callPipeline({
        action: "generate_page",
        projectFacts: facts,
        pagePlan: plan,
        pageId: selectedPage.page_id,
        nodeOutputs: result.nodeOutputs,
      });
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "页面生成失败");
    } finally {
      setBusy(null);
    }
  };

  const audit = async () => {
    setBusy("audit");
    setError("");
    try {
      const next = await callPipeline({
        action: "audit",
        projectFacts: facts,
        pagePlan: plan,
        nodeOutputs: result.nodeOutputs,
      });
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审核失败");
    } finally {
      setBusy(null);
    }
  };

  const updateRole = (documentId: string, role: SourceRole) => {
    setDocuments((current) =>
      current.map((document) =>
        document.document_id === documentId
          ? { ...document, role }
          : document,
      ),
    );
    setDocumentsChanged(true);
  };

  const addPasted = async () => {
    if (!pastedText.trim()) return;
    const nextDocument: InputDocument = {
      document_id: `DOC_NOTE_${Date.now()}`,
      file_name: `用户文字说明_${projectDocuments.length + 1}.md`,
      role: pasteRole,
      version_or_date: new Date().toISOString().slice(0, 10),
      authority_rank: pasteRole === "authoritative" ? 3 : 5,
      page_count: 1,
      text: `===== PAGE 1 =====\n${pastedText.trim()}`,
    };
    const nextDocuments = [...documents, nextDocument];
    setDocuments(nextDocuments);
    setPastedText("");
    setShowPaste(false);
    await processDocuments(nextDocuments);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setError("");
    try {
      const parsed = await Promise.all([...files].map(fileToInputDocument));
      const nextDocuments = [...documents, ...parsed];
      setDocuments(nextDocuments);
      await processDocuments(nextDocuments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件读取失败");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeDocument = (documentId: string) => {
    setDocuments((current) =>
      current.filter((document) => document.document_id !== documentId),
    );
    setDocumentsChanged(true);
  };

  const downloadDebug = () => {
    const payload = {
      projectFacts: facts,
      pagePlan: plan,
      nodeOutputs: result.nodeOutputs,
      modelCallCount: result.modelCallCount,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${facts.project_id}_pipeline-debug.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="workbench-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AR</div>
          <div>
            <div className="eyebrow">ARCHITECTURAL REPORT AGENT · MVP</div>
            <h1>单项目建筑汇报工作台</h1>
          </div>
        </div>
        <div className="project-summary">
          <div className="project-name">
            <span>当前项目</span>
            <strong>
              {hasProjectSource
                ? facts.project_name_anonymized
                : "等待上传任务书"}
            </strong>
          </div>
          <GatePill
            label="Gate A"
            status={
              hasProjectSource
                ? facts.gate_report?.planner_readiness
                : undefined
            }
          />
          <GatePill
            label="Gate B"
            status={
              hasProjectSource
                ? facts.gate_report?.generation_readiness
                : undefined
            }
          />
          <button className="ghost-button" onClick={downloadDebug}>
            <Download size={15} />
            调试数据
          </button>
          <button
            className="primary-button"
            onClick={() =>
              hasProjectSource ? run() : fileInputRef.current?.click()
            }
            disabled={Boolean(busy)}
          >
            {busy === "run" || busy === "upload" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            {hasProjectSource ? "重新分析" : "上传任务书"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={15} />
          {error}
          <button onClick={() => setError("")} aria-label="关闭错误">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <section className="workbench-grid">
        <aside className="panel left-panel">
          <div className="tabbar">
            <button
              className={leftTab === "documents" ? "active" : ""}
              onClick={() => setLeftTab("documents")}
            >
              资料 <span>{documents.length}</span>
            </button>
            <button
              className={leftTab === "facts" ? "active" : ""}
              onClick={() => setLeftTab("facts")}
            >
              事实 <span>{hasProjectSource ? facts.facts.length : 0}</span>
            </button>
            <button
              className={leftTab === "issues" ? "active" : ""}
              onClick={() => setLeftTab("issues")}
            >
              问题{" "}
              <span>
                {hasProjectSource
                  ? facts.missing_items.length + facts.conflicts.length
                  : 0}
              </span>
            </button>
          </div>

          {leftTab === "documents" ? (
            <>
              <div className="panel-toolbar">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                  hidden
                  onChange={(event) => uploadFiles(event.target.files)}
                />
                <button
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy === "upload"}
                >
                  {busy === "upload" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}
                  上传任务书
                </button>
                <button
                  className="icon-text-button"
                  onClick={() => setShowPaste((current) => !current)}
                >
                  <ClipboardPaste size={15} />
                  粘贴补充说明
                </button>
              </div>

              {documentsChanged ? (
                <div className="recognition-notice">
                  <div>
                    <strong>资料角色已调整</strong>
                    <span>重新分析后会同步更新证据、Gate 和目录。</span>
                  </div>
                  <button onClick={run} disabled={Boolean(busy)}>
                    {busy === "run" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Play size={13} fill="currentColor" />
                    )}
                    重新分析
                  </button>
                </div>
              ) : !hasProjectSource ? (
                <div className="fixture-notice">
                  历史参考汇报已内置。现在只需上传本项目任务书，Agent
                  会自动运行到目录。
                </div>
              ) : null}

              {showPaste ? (
                <div className="paste-card">
                  <textarea
                    value={pastedText}
                    onChange={(event) => setPastedText(event.target.value)}
                    placeholder="可直接粘贴任务书摘录、补遗或用户说明，无需整理成字段表。"
                    rows={5}
                  />
                  <div className="paste-actions">
                    <select
                      value={pasteRole}
                      onChange={(event) =>
                        setPasteRole(event.target.value as SourceRole)
                      }
                      aria-label="文字说明角色"
                    >
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="small-primary"
                      onClick={addPasted}
                      disabled={!pastedText.trim()}
                    >
                      <Plus size={14} />
                      加入资料
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="scroll-area document-list">
                <section className="document-zone">
                  <div className="zone-heading">
                    <span>① 当前项目证据库</span>
                    <strong>{projectDocuments.length}</strong>
                  </div>
                  <p>仅权威资料和当前方案可以提供项目事实。</p>
                  {projectDocuments.length ? (
                    projectDocuments.map((document) => (
                      <DocumentCard
                        key={document.document_id}
                        document={document}
                        onRoleChange={updateRole}
                        onRemove={removeDocument}
                      />
                    ))
                  ) : (
                    <button
                      className="empty-upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={17} />
                      <strong>上传本项目任务书</strong>
                      <span>支持 PDF 文字层、TXT 和 Markdown</span>
                    </button>
                  )}
                </section>

                <section className="document-zone reference-zone">
                  <div className="zone-heading">
                    <span>② 历史汇报参考库</span>
                    <strong>{referenceDocuments.length}</strong>
                  </div>
                  <p>只学习章节结构、页型节奏和表达风格，不提供项目事实。</p>
                  {referenceDocuments.map((document) => (
                    <DocumentCard
                      key={document.document_id}
                      document={document}
                      locked={isDefaultReference(document.document_id)}
                      onRoleChange={updateRole}
                      onRemove={removeDocument}
                    />
                  ))}
                </section>
              </div>
            </>
          ) : null}

          {leftTab === "facts" ? (
            <div className="scroll-area fact-list">
              {facts.facts.length ? facts.facts.map((fact) => (
                <article className="fact-card" key={fact.fact_id}>
                  <div className="fact-topline">
                    <code>{fact.fact_id}</code>
                    <span className={`fact-status fact-${fact.status}`}>
                      {fact.status === "conflict" ? "冲突" : "已确认"}
                    </span>
                  </div>
                  <div className="fact-path">{fact.field_path}</div>
                  <strong>{String(fact.value_raw)}</strong>
                  <div className="source-line">
                    {fact.source.document_id} · P{fact.source.page}
                  </div>
                  <blockquote>{fact.source.quote}</blockquote>
                </article>
              )) : (
                <div className="empty-tab-state">
                  <FileSearch size={21} />
                  <strong>还没有当前项目事实</strong>
                  <p>上传任务书后，事实会带着文件、页码和原文显示在这里。</p>
                </div>
              )}
            </div>
          ) : null}

          {leftTab === "issues" ? (
            <div className="scroll-area issue-list">
              {!hasProjectSource ? (
                <div className="empty-tab-state">
                  <AlertTriangle size={21} />
                  <strong>尚未开始完整度检查</strong>
                  <p>上传任务书后，这里只显示真正缺失或冲突的信息。</p>
                </div>
              ) : (
                <>
              <div className="issue-section-title">
                <AlertTriangle size={15} />
                缺失信息
              </div>
              {facts.missing_items.map((item) => (
                <article
                  className={`issue-card issue-${item.severity}`}
                  key={item.item_id}
                >
                  <span>{item.severity}</span>
                  <strong>{item.description}</strong>
                  <p>{item.suggested_source}</p>
                </article>
              ))}
              <div className="issue-section-title">
                <RefreshCw size={15} />
                数值冲突
              </div>
              {facts.conflicts.length ? (
                facts.conflicts.map((conflict) => (
                  <article className="issue-card conflict-card" key={conflict.conflict_id}>
                    <span>{conflict.severity}</span>
                    <strong>{conflict.field_path}</strong>
                    <p>{conflict.fact_ids.join(" · ")}</p>
                  </article>
                ))
              ) : (
                <div className="empty-note">没有检测到冲突。</div>
              )}
                </>
              )}
            </div>
          ) : null}
        </aside>

        <section className="panel outline-panel">
          {!hasProjectSource ? (
            <div className="planner-onboarding">
              <div className="onboarding-kicker">HISTORICAL REFERENCE READY</div>
              <h2>历史参考已经准备好，<br />现在只需上传任务书。</h2>
              <p>
                上传完成后，Agent 会自动读取文字与表格、建立当前项目证据库、
                检查完整度，并生成 8—12 页目录。
              </p>
              <div className="onboarding-flow">
                <span>任务书</span>
                <ChevronRight size={15} />
                <span>证据与 Gate</span>
                <ChevronRight size={15} />
                <span>页级目录</span>
              </div>
              <button
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(busy)}
              >
                <Upload size={16} />
                选择任务书
              </button>
              <small>不会要求你先填写“设计目标”等字段。</small>
            </div>
          ) : (
            <>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">PAGE-LEVEL PLAN</div>
              <h2>页级目录</h2>
            </div>
            <div className="page-count">{plan.pages.length} 页</div>
          </div>
          <div className="narrative-card">
            <Layers3 size={16} />
            <div>
              <span>全篇主张</span>
              <p>{plan.narrative_claim}</p>
            </div>
          </div>
          <div className="scroll-area page-list">
            {plan.pages.map((page) => (
              <button
                className={`page-row ${
                  selectedPageId === page.page_id ? "selected" : ""
                }`}
                key={page.page_id}
                onClick={() => setSelectedPageId(page.page_id)}
              >
                <div className="page-number">
                  {String(page.display_page_number).padStart(2, "0")}
                </div>
                <div className="page-row-main">
                  <div className="page-row-top">
                    <span>{pageTypeLabels[page.page_type]}</span>
                    <StatusPill status={page.generation_status} />
                  </div>
                  <strong>{page.headline_zh}</strong>
                  <p>{page.core_message}</p>
                  <div className="page-evidence">
                    <Quote size={12} />
                    {page.fact_refs.length} 条事实
                    {page.missing_information.length ? (
                      <span>· 缺 {page.missing_information.length}</span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
            </>
          )}
        </section>

        <aside className="panel detail-panel">
          {!hasProjectSource ? (
            <div className="empty-detail waiting-detail">
              <FileSearch size={26} />
              <strong>等待当前项目证据</strong>
              <p>目录生成后，在这里选择一页查看文案、缺失信息和事实引用。</p>
            </div>
          ) : selectedPage ? (
            <>
              <div className="detail-heading">
                <div className="page-index-block">
                  <span>PAGE</span>
                  <strong>
                    {String(selectedPage.display_page_number).padStart(2, "0")}
                  </strong>
                </div>
                <div className="detail-title">
                  <div>
                    <StatusPill status={selectedPage.generation_status} />
                    <span className="page-type-label">
                      {pageTypeLabels[selectedPage.page_type]}
                    </span>
                  </div>
                  <h2>{selectedPage.headline_zh}</h2>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="primary-button generate-button"
                  onClick={generatePage}
                  disabled={
                    Boolean(busy) ||
                    selectedPage.generation_status === "blocked"
                  }
                >
                  {busy === "generate" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  仅生成当前页中文文案
                </button>
                <button
                  className="secondary-button"
                  onClick={audit}
                  disabled={Boolean(busy)}
                >
                  {busy === "audit" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  审核已生成页
                </button>
              </div>

              <div className="scroll-area detail-scroll">
                <section className="detail-section core-message">
                  <FieldLabel icon={<CircleDot size={14} />}>
                    CORE MESSAGE
                  </FieldLabel>
                  <p>{selectedPage.core_message}</p>
                </section>

                <section className="detail-section">
                  <FieldLabel icon={<BookOpenText size={14} />}>
                    BODY COPY
                  </FieldLabel>
                  <div
                    className={`copy-block ${
                      selectedPage.body_copy ? "" : "empty"
                    }`}
                  >
                    {selectedPage.body_copy ||
                      (selectedPage.generation_status === "blocked"
                        ? "本页证据不足，生成已阻断。"
                        : "选择“仅生成当前页中文文案”后显示正文。")}
                  </div>
                </section>

                <section className="detail-section">
                  <FieldLabel icon={<FileSearch size={14} />}>
                    DIAGRAM LABELS
                  </FieldLabel>
                  <div className="chip-list">
                    {selectedPage.diagram_labels.length ? (
                      selectedPage.diagram_labels.map((label) => (
                        <span key={label}>{label}</span>
                      ))
                    ) : (
                      <em>尚未生成图上标注</em>
                    )}
                  </div>
                </section>

                <section className="detail-section split-detail">
                  <div>
                    <FieldLabel>VISUAL REQUIREMENTS</FieldLabel>
                    <ul>
                      {selectedPage.visual_requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <FieldLabel>MISSING INFORMATION</FieldLabel>
                    {selectedPage.missing_information.length ? (
                      <ul className="missing-list">
                        {selectedPage.missing_information.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="confirmed-note">
                        <Check size={13} /> 当前页所需字段已齐备
                      </p>
                    )}
                  </div>
                </section>

                <section className="detail-section">
                  <FieldLabel>SPEAKER NOTES</FieldLabel>
                  <p className="speaker-notes">
                    {selectedPage.speaker_notes || "生成页面后补充讲述提示。"}
                  </p>
                </section>

                <section className="detail-section">
                  <FieldLabel icon={<Quote size={14} />}>
                    FACT REFERENCES
                  </FieldLabel>
                  <div className="reference-list">
                    {selectedFacts.length ? (
                      selectedFacts.map((fact) => (
                        <article key={fact.fact_id}>
                          <div>
                            <code>{fact.fact_id}</code>
                            <span>
                              {fact.source.document_id} · P{fact.source.page}
                            </span>
                          </div>
                          <strong>{String(fact.value_raw)}</strong>
                          <blockquote>{fact.source.quote}</blockquote>
                        </article>
                      ))
                    ) : (
                      <div className="empty-note">当前页没有可用事实引用。</div>
                    )}
                  </div>
                </section>

                {plan.audit_report ? (
                  <section className="detail-section audit-section">
                    <FieldLabel icon={<ShieldCheck size={14} />}>
                      CONSISTENCY AUDIT
                    </FieldLabel>
                    <p>{plan.audit_report.summary}</p>
                    {plan.audit_report.issues
                      .filter((issue) =>
                        issue.pages.includes(selectedPage.page_id),
                      )
                      .map((issue, index) => (
                        <article key={`${issue.issue}-${index}`}>
                          <span>{issue.severity}</span>
                          <strong>{issue.issue}</strong>
                          <p>{issue.recommended_fix}</p>
                        </article>
                      ))}
                  </section>
                ) : null}

                <section className="debug-section">
                  <button onClick={() => setShowDebug((current) => !current)}>
                    <Braces size={14} />
                    原始结构化输出
                    <span>{showDebug ? "收起" : "展开"}</span>
                  </button>
                  {showDebug ? (
                    <div className="debug-stack">
                      {result.nodeOutputs.map((nodeOutput, index) => (
                        <details key={`${nodeOutput.node}-${index}`}>
                          <summary>
                            {index + 1}. {nodeOutput.node}
                            <span>本地规则 · 0 次模型</span>
                          </summary>
                          <pre>
                            {JSON.stringify(nodeOutput.output, null, 2)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            </>
          ) : (
            <div className="empty-detail">请选择一页。</div>
          )}
        </aside>
      </section>
    </main>
  );
}

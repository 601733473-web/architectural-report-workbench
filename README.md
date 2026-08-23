# 智能建筑汇报文本工作台

**ARCHITECTURAL REPORT INTELLIGENCE STUDIO**

一个面向建筑设计汇报工作的多项目工作台。用户上传任务书后，系统会生成可追溯的项目事实、事实就绪/提案就绪状态、默认 35 页汇报结构、单页中英标题与中文正文、视觉草案和一致性审核结果。当前项目可归档后再新建设计；配置 MemFire 后，项目、历史版本和生成结果自动保存到云端。

历史参考档案只保存章节结构、页型节奏和表达风格。其项目数字、设计结论与公司信息不会进入当前项目事实或 `fact_refs`。

页面配方检索综合使用页面主题、叙事目的、证据/素材类型、主视觉和布局家族；35 页目录会统一分配配方，对重复配方和相邻同构版式降权。文风样本负责标题与论述顺序，视觉页面配方负责主视觉和图文组织，二者冲突时以页面配方为准。

## 数据契约

唯一领域契约位于仓库内：

- `schemas/project_facts.schema.json`
- `schemas/page_plan.schema.json`

`scripts/generate-contracts.mjs` 从这两份 schema 自动生成 TypeScript 类型和运行时 schema 常量。API 与前端不维护手写的平行领域类型。

## 节点顺序

1. PDF / TXT / Markdown 资料解析
2. 资料登记与角色分流
3. 建立当前项目证据区与历史参考区
4. 项目事实、冲突、缺失与设计命题提取
5. 事实就绪 / 提案就绪完整度检查
6. 结合历史参考结构生成默认 35 页目录
7. 用户选择一页生成中文文案
8. 对已生成页面执行一致性审核

所有节点的原始结构化输出保存在项目数据中，但不直接展示在用户端，避免历史参考配方与后台变量泄露。

## 当前执行模式

配置 `OPENAI_API_KEY` 后，工作台使用兼容 Responses API 和严格
Structured Outputs 执行六个模型节点：

- 上传后：资料登记、事实提取、完整度、Planner，共 4 次模型调用
- 用户生成一页：1 次模型调用
- 用户执行全篇审核：1 次模型调用

默认接口为 `https://ruishiglobal.com/v1`，默认模型为 `gpt-5.5`，可分别用
`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 覆盖，也可以在网页的“API 设置”中为
当前会话临时修改。PDF 会同时提交原始
文件和分页文字层，以便模型读取页面视觉、表格和文字；最终事实仍须经过
角色隔离、页码、引用、公司信息和 schema 的本地校验。

没有密钥或模型调用失败时，系统会显式进入“本地回退”并显示原因：
角色推断、基础事实提取、Gate、35 页骨架、单页模板和一致性检查仍可运行，
但不会伪装成真实模型结果。历史参考使用内置的三来源A3结构、语义标签与页型档案，
不向当前项目事实提供任何内容。

## MemFire 项目与参考库存储

1. 在 MemFire SQL 编辑器执行 `memfire/schema.sql`。
2. 在 `.env.local` 配置 `MEMFIRE_URL` 和仅供服务端使用的 `MEMFIRE_SERVICE_ROLE_KEY`。匿名密钥可以保留用于连接识别，但不会被用来读写私有项目数据。
3. 执行 `npm run memfire:reference:migrate`，将结构化参考数据和参考图片复制到私有对象存储。
4. 重启本地服务。工作台会优先读取 MemFire，并把现有浏览器项目自动迁移到云端。

未配置或暂时无法连接 MemFire 时，工作台使用浏览器 IndexedDB 临时存档，并在顶部明确显示“MemFire 未接入”。历史参考库在用户端只展示接入状态，不展示项目名、页码、配方或后台结构化内容。

## 本地验证

```bash
npm run fixture:run
npm run fixture:brief
npm run schema:check
npm run typecheck
npm run build
node --test tests/rendered-html.test.mjs
```

完整资料虚拟项目位于 `fixtures/virtual-project/`；“系统参考 + 单任务书”回归项目位于 `fixtures/brief-only/`。两条链路的完整运行结果均写入各自的 `full-run.json`。

## 当前未实现

- 独立 OCR 引擎（模型可以直接读取上传 PDF 的页面视觉）
- DWG / RVT / SKP 等原生图纸与模型文件解析
- 账号体系与多人权限管理

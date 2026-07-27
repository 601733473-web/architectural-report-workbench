# 单项目建筑汇报工作台 MVP

一个无账号、无数据库、无多项目管理的内部工作台。系统已内置用户提供的 109 页历史参考汇报档案；用户只需上传任务书，工作台会自动输出可追溯的项目事实、Gate A / Gate B、8-12 页汇报目录、单页中文文案和一致性审核结果。

历史参考档案只保存章节结构、页型节奏和表达风格。其项目数字、设计结论与公司信息不会进入当前项目事实或 `fact_refs`。

## 数据契约

唯一领域契约位于父目录：

- `output/design_report_agent_v0_1/schemas/project_facts.schema.json`
- `output/design_report_agent_v0_1/schemas/page_plan.schema.json`

`scripts/generate-contracts.mjs` 从这两份 schema 自动生成 TypeScript 类型和运行时 schema 常量。API 与前端不维护手写的平行领域类型。

## 节点顺序

1. PDF / TXT / Markdown 资料解析
2. 资料登记与角色分流
3. 建立当前项目证据区与历史参考区
4. 项目事实、冲突、缺失与设计命题提取
5. Gate A / Gate B 完整度检查
6. 结合历史参考结构生成 8-12 页目录
7. 用户选择一页生成中文文案
8. 对已生成页面执行一致性审核

所有节点的原始结构化输出保存在 `nodeOutputs`，可在右侧“原始结构化输出”或“调试数据”下载中查看。

## 当前执行模式

配置 `OPENAI_API_KEY` 后，工作台使用 OpenAI Responses API 和严格
Structured Outputs 执行六个模型节点：

- 上传后：资料登记、事实提取、完整度、Planner，共 4 次模型调用
- 用户生成一页：1 次模型调用
- 用户执行全篇审核：1 次模型调用

默认模型为 `gpt-5.6-sol`，可用 `OPENAI_MODEL` 覆盖。PDF 会同时提交原始
文件和分页文字层，以便模型读取页面视觉、表格和文字；最终事实仍须经过
角色隔离、页码、引用、公司信息和 schema 的本地校验。

没有密钥或模型调用失败时，系统会显式进入“本地回退”并显示原因：
角色推断、基础事实提取、Gate、10 页骨架、单页模板和一致性检查仍可运行，
但不会伪装成真实模型结果。历史参考仍使用内置的 109 页 A3 结构与页型档案，
不向当前项目事实提供任何内容。

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
- 自动 PPT、A3 排版与导出
- 文案人工编辑和版本历史
- 登录、数据库、云端文件存储
- 多项目管理
- 中英双语正文生成

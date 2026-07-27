# 单项目建筑汇报工作台 MVP

一个无账号、无数据库、无多项目管理的内部工作台。它接收 PDF 文本层、TXT、Markdown 或用户文字说明，输出可追溯的项目事实、Gate A / Gate B、8-12 页汇报目录、单页中文文案和一致性审核结果。

## 数据契约

唯一领域契约位于父目录：

- `output/design_report_agent_v0_1/schemas/project_facts.schema.json`
- `output/design_report_agent_v0_1/schemas/page_plan.schema.json`

`scripts/generate-contracts.mjs` 从这两份 schema 自动生成 TypeScript 类型和运行时 schema 常量。API 与前端不维护手写的平行领域类型。

## 节点顺序

1. 资料登记与角色分流
2. 项目事实提取
3. Gate A / Gate B 完整度检查
4. 8-12 页目录 Planner
5. 用户选择一页生成中文文案
6. 对已生成页面执行一致性审核

所有节点的原始结构化输出保存在 `nodeOutputs`，可在右侧“原始结构化输出”或“调试数据”下载中查看。

## 当前执行模式

当前 MVP 全部使用本地确定性规则，真实模型调用次数为 0：

- 角色推断：文件名与关键词规则
- 事实提取：字段标签、分页标记与数值标准化规则
- 完整度：固定 Gate A / Gate B 条件
- Planner：10 页建筑汇报骨架结合事实可用性
- 单页文案：按页型使用事实引用组合
- 一致性审核：事实引用、数字、冲突、公司信息与重复结论检查

六段提示词保留为后续真实模型接入规范，但本阶段不会把资料发送到外部模型。

## 本地验证

```bash
npm run fixture:run
npm run schema:check
npm run typecheck
npm run build
node --test tests/rendered-html.test.mjs
```

虚拟项目位于 `fixtures/virtual-project/`。完整运行结果写入 `full-run.json`。

## 当前未实现

- 扫描 PDF 的 OCR
- 图纸、图片和模型的视觉理解
- 真实大模型调用
- 自动 PPT、A3 排版与导出
- 文案人工编辑和版本历史
- 登录、数据库、云端文件存储
- 多项目管理
- 中英双语正文生成


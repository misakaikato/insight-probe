import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const claims = (ctx.relatedClaims ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (状态: ${n.status ?? "未知"})`)
		.join("\n");

	const openQuestions = (ctx.openQuestions ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (优先级: ${n.attrs?.priority ?? "未设置"})`)
		.join("\n");

	const entities = (ctx.focusNodes ?? [])
		.filter((n) => n.kind === "Entity")
		.map((n) => `- ${n.title ?? n.id} (${n.type ?? "未分类"})${n.attrs?.aliases ? ` 别名: ${(n.attrs.aliases as string[]).join(", ")}` : ""}`)
		.join("\n");

	return `你是一个知识图谱研究搜索策略专家。请基于当前知识图谱的状态，生成下一步搜索查询词，以推进研究进展。

## 已有断言
${claims || "（暂无断言）"}

## 待解决问题
${openQuestions || "（暂无问题）"}

## 已有实体
${entities || "（暂无实体）"}

## 研究任务
${ctx.task ? `标题: ${ctx.task.title}\n目标: ${ctx.task.goal}` : "（未指定任务）"}

## 指令
1. 分析当前知识图谱中的信息缺口和研究方向
2. 生成有针对性的搜索查询词，帮助填补知识空白
3. 每个查询词需要同时提供中文和英文版本
4. 查询词类型可以包括：
   - 验证性搜索：验证已有断言
   - 探索性搜索：探索未知领域
   - 对比性搜索：比较不同观点
   - 时效性搜索：查找最新进展
5. 为每个搜索词设定优先级（priority，0-1 之间）
6. 每个搜索词必须包含：queryZh（中文搜索词）、queryEn（英文搜索词）
7. 可选字段：purpose（搜索目的）、priority（优先级）

## 约束
- 搜索词应具体明确，避免过于宽泛
- 中文搜索词适合中文搜索引擎和文献
- 英文搜索词适合国际学术数据库和搜索引擎
- 优先考虑能验证关键断言或回答高优先级问题的搜索
- 不要生成已有搜索词的简单重复
- 每个搜索词都应有明确的搜索目的
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			queries: {
				type: "array",
				items: {
					type: "object",
					properties: {
						queryZh: { type: "string", description: "中文搜索词" },
						queryEn: { type: "string", description: "英文搜索词" },
						purpose: { type: "string", description: "搜索目的" },
						priority: { type: "number", description: "优先级 (0-1)" },
					},
					required: ["queryZh", "queryEn"],
				},
			},
		},
		required: ["queries"],
	};
}

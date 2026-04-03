import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const claims = (ctx.relatedClaims ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (状态: ${n.status ?? "未知"}, 置信度: ${n.confidence ?? "未评估"})`)
		.join("\n");

	const existingQuestions = (ctx.openQuestions ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (状态: ${n.status ?? "未知"}, 优先级: ${n.attrs?.priority ?? "未设置"})`)
		.join("\n");

	const entities = (ctx.focusNodes ?? [])
		.filter((n) => n.kind === "Entity")
		.map((n) => `- ${n.title ?? n.id} (${n.type ?? "未分类"})`)
		.join("\n");

	return `你是一个知识图谱研究问题生成专家。请基于当前知识图谱的状态，生成有助于推进研究的新问题。

## 当前已有断言
${claims || "（暂无断言）"}

## 已有问题（避免重复）
${existingQuestions || "（暂无问题）"}

## 已有实体
${entities || "（暂无实体）"}

## 研究任务
${ctx.task ? `标题: ${ctx.task.title}\n目标: ${ctx.task.goal}` : "（未指定任务）"}

## 指令
1. 分析当前知识图谱中的信息缺口和研究方向
2. 生成有助于填补知识空白的研究问题
3. 问题类型可以包括：
   - 验证性问题：验证已有断言的可靠性
   - 探索性问题：探索未知的关联或因果关系
   - 比较性问题：比较不同实体或断言的异同
   - 时间性问题：探究时间线上的变化和趋势
4. 为每个问题设定优先级（priority，0-1 之间，越高越重要）
5. 每个问题必须包含：text（问题文本）
6. 可选字段：questionType（问题类型）、priority（优先级）

## 约束
- 问题必须与已有知识图谱内容相关
- 不要生成已有问题的重复或变体
- 问题应该是可以通过进一步研究来回答的
- 问题表述要清晰明确，避免过于宽泛
- 优先考虑能够验证或反驳现有断言的问题
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			questions: {
				type: "array",
				items: {
					type: "object",
					properties: {
						text: { type: "string", description: "问题文本" },
						questionType: { type: "string", description: "问题类型" },
						priority: { type: "number", description: "优先级 (0-1)" },
					},
					required: ["text"],
				},
			},
		},
		required: ["questions"],
	};
}

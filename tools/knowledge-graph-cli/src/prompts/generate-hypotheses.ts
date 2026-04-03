import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const claims = (ctx.relatedClaims ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (状态: ${n.status ?? "未知"}, 置信度: ${n.confidence ?? "未评估"})`)
		.join("\n");

	const evidence = (ctx.relatedEvidence ?? [])
		.map((n) => `- [${n.id}] ${n.text ?? n.summary ?? n.id} (来源: ${n.attrs?.sourceId ?? "未知"})`)
		.join("\n");

	const openQuestions = (ctx.openQuestions ?? [])
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}"`)
		.join("\n");

	const entities = (ctx.focusNodes ?? [])
		.filter((n) => n.kind === "Entity")
		.map((n) => `- ${n.title ?? n.id} (${n.type ?? "未分类"})`)
		.join("\n");

	return `你是一个知识图谱假设生成专家。请基于当前知识图谱中的断言、证据和问题，提出有价值的假设（Hypothesis）。

## 已有断言
${claims || "（暂无断言）"}

## 已有证据
${evidence || "（暂无证据）"}

## 待解决问题
${openQuestions || "（暂无问题）"}

## 已有实体
${entities || "（暂无实体）"}

## 研究任务
${ctx.task ? `标题: ${ctx.task.title}\n目标: ${ctx.task.goal}` : "（未指定任务）"}

## 指令
1. 分析已有断言之间的关联和潜在模式
2. 基于证据提出可能的解释或因果关系
3. 针对未解决的问题提出可能的答案（假设）
4. 每个假设应该是可验证的、有依据的推测
5. 为每个假设评估初始置信度（confidence，0-1 之间）
6. 每个假设必须包含：text（假设文本）
7. 可选字段：confidence（置信度）、reasoning（推理过程）

## 约束
- 假设必须基于已有证据或合理推断，不要凭空猜测
- 每个假设应明确说明基于哪些断言或证据
- 置信度应反映证据的充分程度
- 假设应具有可测试性
- 不要生成与已有断言直接矛盾且无依据的假设
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			hypotheses: {
				type: "array",
				items: {
					type: "object",
					properties: {
						text: { type: "string", description: "假设文本" },
						confidence: { type: "number", description: "初始置信度 (0-1)" },
						reasoning: { type: "string", description: "推理过程说明" },
					},
					required: ["text"],
				},
			},
		},
		required: ["hypotheses"],
	};
}

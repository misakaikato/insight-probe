import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const sourceSection = ctx.source
		? `## 来源内容
标题: ${ctx.source.title ?? "(无标题)"}
类型: ${ctx.source.type ?? "未知"}
内容摘要: ${ctx.source.summary ?? ctx.source.text ?? "(无内容)"}
${ctx.source.attrs?.uri ? `URI: ${ctx.source.attrs.uri}` : ""}`
		: "## 来源内容\n（未提供来源）";

	const existingEntities = (ctx.focusNodes ?? [])
		.filter((n) => n.kind === "Entity")
		.map((n) => `- [${n.id}] ${n.title ?? n.id} (${n.type ?? "未分类"})`)
		.join("\n");

	const existingObservations = (ctx.focusNodes ?? [])
		.filter((n) => n.kind === "Observation")
		.map((n) => `- ${n.text ?? n.summary ?? n.id}`)
		.join("\n");

	return `你是一个知识图谱观察提取专家。请从给定的来源内容中提取客观的事实性观察（Observation）。

${sourceSection}

## 已有实体
${existingEntities || "（暂无）"}

## 已有观察（避免重复）
${existingObservations || "（暂无）"}

## 指令
1. 从来源内容中提取客观的、可验证的事实性陈述
2. 每个观察应是一个独立的事实，不包含主观判断
3. 标注观察涉及的实体 ID（如果匹配已有实体）
4. 区分事实性观察和推断性观察（用 observationType 字段）
5. 每个观察必须包含：text（观察文本）
6. 可选字段：entityIds（关联实体ID列表）、observationType（factual 或 inferred）

## 约束
- 观察必须是原文中明确陈述或可直接推导的事实
- 不要包含观点、猜测或无法验证的陈述
- 保持观察的原子性，一条观察只描述一个事实
- 使用简洁明确的表述
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			observations: {
				type: "array",
				items: {
					type: "object",
					properties: {
						text: { type: "string", description: "观察文本内容" },
						entityIds: {
							type: "array",
							items: { type: "string" },
							description: "关联的实体 ID 列表",
						},
						observationType: {
							type: "string",
							enum: ["factual", "inferred"],
							description: "观察类型：事实性或推断性",
						},
					},
					required: ["text"],
				},
			},
		},
		required: ["observations"],
	};
}

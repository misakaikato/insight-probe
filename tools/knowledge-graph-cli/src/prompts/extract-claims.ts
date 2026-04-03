import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const sourceSection = ctx.source
		? `## 来源内容
标题: ${ctx.source.title ?? "(无标题)"}
类型: ${ctx.source.type ?? "未知"}
内容摘要: ${ctx.source.summary ?? ctx.source.text ?? "(无内容)"}
${ctx.source.attrs?.uri ? `URI: ${ctx.source.attrs.uri}` : ""}`
		: "## 来源内容\n（未提供来源）";

	const existingClaims = (ctx.relatedClaims ?? [])
		.map((n) => `- [${n.id}] ${n.text ?? n.summary ?? n.id} (状态: ${n.status ?? "未知"})`)
		.join("\n");

	const knownClaimTypes = ctx.knownSchema?.claimTypes?.join(", ") ?? "事实陈述, 观点, 预测, 因果关系, 定义, 比较";

	return `你是一个知识图谱断言提取专家。请从给定的来源内容中提取所有有意义的断言（Claim）。

${sourceSection}

## 已有断言（避免重复）
${existingClaims || "（暂无）"}

## 已知断言类型
${knownClaimTypes}

## 指令
1. 从来源内容中识别所有明确的断言、论点或主张
2. 为每个断言指定合适的类型（claimType）
3. 评估断言的置信度（confidence，0-1 之间）
4. 精确引用原文中的关键表述（如有）
5. 每个断言必须包含：text（断言文本）
6. 可选字段：claimType（断言类型）、confidence（置信度）、quote（原文引用）

## 约束
- 断言应保持原文的含义，不要过度解读
- 置信度基于来源的可靠性和表述的明确程度
- 如果断言有时间限定，请在 validTime 中标注
- 不要提取过于琐碎或显而易见的陈述
- 将复合断言拆分为独立的原子断言
- 不要与已有断言重复
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			claims: {
				type: "array",
				items: {
					type: "object",
					properties: {
						text: { type: "string", description: "断言文本" },
						claimType: { type: "string", description: "断言类型" },
						confidence: { type: "number", description: "置信度 (0-1)" },
						quote: { type: "string", description: "原文引用" },
						validTime: {
							type: "object",
							properties: {
								start: { type: "string", description: "起始时间" },
								end: { type: "string", description: "结束时间" },
							},
						},
					},
					required: ["text"],
				},
			},
		},
		required: ["claims"],
	};
}

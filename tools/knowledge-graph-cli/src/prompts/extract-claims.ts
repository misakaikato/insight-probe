import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const hasFullText = ctx.source?.text && ctx.source.text.length > 100;
	const sourceSection = ctx.source
		? `## 来源内容
标题: ${ctx.source.title ?? "(无标题)"}
类型: ${ctx.source.type ?? "未知"}
${hasFullText ? `正文内容:\n${ctx.source.text}` : `内容摘要: ${ctx.source.summary ?? ctx.source.text ?? "(无内容)"}`}
${ctx.source.attrs?.uri ? `URI: ${ctx.source.attrs.uri}` : ""}`
		: "## 来源内容\n（未提供来源）";

	const existingClaims = (ctx.relatedClaims ?? [])
		.map((n) => `- [${n.id}] ${n.text ?? n.summary ?? n.id} (状态: ${n.status ?? "未知"})`)
		.join("\n");

	const knownClaimTypes = ctx.knownSchema?.claimTypes?.join(", ") ?? "事实陈述, 观点, 预测, 因果关系, 定义, 比较";

	return `你是一个知识图谱断言提取专家。请从给定的来源内容中深度提取有意义的断言（Claim）。

## 深度提取要求

每个 Claim 必须满足以下标准：

1. **完整性**：text 字段应 ≥50 字，包含：
   - 核心陈述（是什么）
   - 条件/上下文（在什么条件下成立）
   - 证据/数据支撑（有什么证据支持）
   - 局限性/边界（在哪里不适用）

2. **机制解释**：如果内容涉及因果关系或机制，必须包含"为什么"

3. **原文引用**：必须包含 quote 字段（≥20字），直接引用原文关键表述

4. **类型标注**：为每个 claim 指定 claimType（定义/因果关系/实验结果/理论/反例等）

${sourceSection}

## 已有断言（避免重复）
${existingClaims || "（暂无）"}

## 已知断言类型
${knownClaimTypes}

## 指令
1. 从来源内容中识别所有明确的断言、论点或主张
2. **即使只有标题或摘要，也要提取知识**：如果正文不可用，从标题和摘要中提取断言，但需标注置信度较低
3. **禁止**提取标题式、描述性的一句话 claim（即使从摘要提取也要扩展为完整知识单元）
4. **禁止**将复合断言合并为单一简句
5. 为每个断言指定合适的类型（claimType）
6. 评估断言的置信度（confidence，0-1 之间）
   - 有完整正文：置信度 0.7-1.0
   - 仅标题/摘要：置信度 0.3-0.7
6. 精确引用原文中的关键表述（quote 字段，≥20字）
7. 每个断言必须包含：text（≥50字）、claimType、quote（≥20字）、confidence

## 约束
- 断言应保持原文的含义，不要过度解读
- 置信度基于来源的可靠性和表述的明确程度
- 如果断言有时间限定，请在 validTime 中标注
- 不要提取过于琐碎或显而易见的陈述
- 将复合断言拆分为独立的原子断言，每个都要有完整的机制解释
- 不要与已有断言重复
- 输出 JSON 格式

## 错误示例（避免）
❌ "Apophenia 是 Klaus Conrad 提出的概念"  （过短，无机制，无引用）
✅ "Apophenia 一词由德国精神病学家 Klaus Conrad 于 1958 年在其关于精神分裂症早期的研究中首次提出，定义为'在无关事物中无动机地感知联系的倾向'。该术语源自希腊语 apophaínein，意为'展示出来'。在进化心理学视角下，这种倾向被视为人类认知系统的固有特征，而非病理状态。"  （完整，包含定义、来源、机制）

## 正确示例
✅ 每个 claim 都应该像上面的正确示例一样完整`;
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

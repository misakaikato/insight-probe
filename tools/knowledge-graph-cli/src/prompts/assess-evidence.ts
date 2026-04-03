import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const focusClaim = (ctx.focusNodes ?? []).find((n) => n.kind === "Claim");
	const claimInfo = focusClaim
		? `## 待评估断言
ID: ${focusClaim.id}
文本: "${focusClaim.text ?? focusClaim.summary ?? ""}"
类型: ${focusClaim.attrs?.claimType ?? "未分类"}
当前状态: ${focusClaim.status ?? "未知"}
当前置信度: ${focusClaim.confidence ?? "未评估"}`
		: "## 待评估断言\n（未指定断言）";

	const evidenceList = (ctx.relatedEvidence ?? [])
		.map((n) => {
			const sourceInfo = n.attrs?.sourceId ? `来源ID: ${n.attrs.sourceId}` : "";
			const quoteInfo = n.attrs?.quote ? `引用: "${n.attrs.quote}"` : "";
			return `- [${n.id}] ${n.text ?? n.summary ?? ""} ${sourceInfo} ${quoteInfo}`;
		})
		.join("\n");

	const relatedClaims = (ctx.relatedClaims ?? [])
		.filter((n) => focusClaim && n.id !== focusClaim.id)
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (状态: ${n.status ?? "未知"})`)
		.join("\n");

	return `你是一个知识图谱证据评估专家。请对指定断言的证据支持情况进行全面评估。

${claimInfo}

## 相关证据
${evidenceList || "（暂无相关证据）"}

## 相关断言
${relatedClaims || "（暂无其他相关断言）"}

## 指令
1. 仔细分析每条证据与断言的关系
2. 评估证据的：
   - 相关性：证据与断言的关联程度
   - 可靠性：证据来源的可信程度
   - 充分性：证据是否足以支持断言
3. 判断断言的整体证据状态：
   - supported：有充分可靠证据支持
   - weakly_supported：有证据但不够充分或来源单一
   - contested：存在相互矛盾的证据
   - contradicted：证据主要反驳该断言
   - proposed：尚无明确证据
4. 给出综合置信度评估（0-1 之间）
5. 如有矛盾证据，指出矛盾所在
6. 建议需要进一步收集的证据类型

## 约束
- 评估必须基于客观证据，不要加入个人偏见
- 区分强证据和弱证据
- 注意证据的时间有效性和适用范围
- 如果证据不足，明确指出而非给出武断结论
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			assessment: {
				type: "object",
				properties: {
					recommendedStatus: {
						type: "string",
						enum: ["proposed", "supported", "weakly_supported", "contested", "contradicted"],
						description: "推荐的断言状态",
					},
					confidence: { type: "number", description: "综合置信度 (0-1)" },
					summary: { type: "string", description: "评估摘要" },
					evidenceAnalysis: {
						type: "array",
						items: {
							type: "object",
							properties: {
								evidenceId: { type: "string", description: "证据 ID" },
								role: {
									type: "string",
									enum: ["supports", "contradicts", "mentions", "qualifies"],
									description: "证据角色",
								},
								relevance: { type: "number", description: "相关性 (0-1)" },
								reliability: { type: "number", description: "可靠性 (0-1)" },
								notes: { type: "string", description: "分析说明" },
							},
							required: ["evidenceId", "role"],
						},
					},
					suggestions: {
						type: "array",
						items: { type: "string" },
						description: "进一步收集证据的建议",
					},
				},
				required: ["recommendedStatus", "confidence", "summary"],
			},
		},
		required: ["assessment"],
	};
}

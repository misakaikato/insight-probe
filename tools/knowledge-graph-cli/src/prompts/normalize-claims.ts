import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const claims = (ctx.focusNodes ?? []).filter((n) => n.kind === "Claim");

	const claimList = claims
		.map((n) => `- [${n.id}] "${n.text ?? n.summary ?? n.id}" (类型: ${n.attrs?.claimType ?? "未分类"}, 状态: ${n.status ?? "未知"}, 置信度: ${n.confidence ?? "未评估"})`)
		.join("\n");

	return `你是一个知识图谱断言规范化专家。请检查以下断言列表，找出可能重复或需要合并的断言。

## 待检查的断言列表
${claimList || "（暂无断言）"}

## 指令
1. 仔细比较每对断言，识别表达相同或实质相同含义的断言
2. 判断依据包括：
   - 文本内容完全相同
   - 表述不同但核心含义一致
   - 一个断言是另一个的更详细版本
   - 逻辑等价的断言
3. 对于每组可能的重复，给出合并建议
4. 指出建议保留的断言（preferId），通常是表述更清晰、信息更完整的那个

## 约束
- 只标记真正含义重复的断言
- 角度或侧重点不同的断言不应被合并
- 互补的断言应保留各自独立
- 给出判断理由
- 如果没有重复，返回空数组
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			duplicates: {
				type: "array",
				items: {
					type: "object",
					properties: {
						claimIds: {
							type: "array",
							items: { type: "string" },
							description: "重复断言的 ID 列表",
						},
						reason: { type: "string", description: "判断为重复的理由" },
						preferId: { type: "string", description: "建议保留的断言 ID" },
					},
					required: ["claimIds", "reason", "preferId"],
				},
			},
		},
		required: ["duplicates"],
	};
}

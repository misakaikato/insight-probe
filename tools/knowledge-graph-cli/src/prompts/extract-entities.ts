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
		.map((n) => `- ${n.title ?? n.id} (${n.type ?? "未分类"})${n.attrs?.aliases ? ` 别名: ${(n.attrs.aliases as string[]).join(", ")}` : ""}`)
		.join("\n");

	const knownEntityTypes = ctx.knownSchema?.entityTypes?.join(", ") ?? "人物, 组织, 地点, 概念, 事件, 技术, 产品";

	return `你是一个知识图谱实体提取专家。请从给定的来源内容中提取所有有意义的实体（Entity）。

${sourceSection}

## 已知实体类型
${knownEntityTypes}

## 已有实体（避免重复）
${existingEntities || "（暂无）"}

## 指令
1. 仔细阅读来源内容，识别所有值得记录的实体
2. 为每个实体指定合适的类型（从已知实体类型中选择或推断）
3. 如果实体可能有多个称呼，请列出别名（aliases）
4. 提供简短的实体描述/摘要
5. 不要与已有实体重复，如果来源中提到的是已知实体的别名，请标注
6. 每个实体必须包含：name（名称）、entityType（实体类型）
7. 可选字段：description（描述）、aliases（别名列表）

## 约束
- 只提取明确在文本中出现或被明确提及的实体
- 不要推测或虚构实体
- 实体名称使用原文中的称呼
- 保持客观中立
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			entities: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string", description: "实体名称" },
						entityType: { type: "string", description: "实体类型" },
						description: { type: "string", description: "实体描述" },
						aliases: {
							type: "array",
							items: { type: "string" },
							description: "别名列表",
						},
					},
					required: ["name", "entityType"],
				},
			},
		},
		required: ["entities"],
	};
}

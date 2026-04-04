import type { BaseNode, PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const edges = ctx.relatedEdges ?? [];
	const predicates = [...new Set(edges.map((e) => e.type))];

	// Build node lookup from focusNodes
	const nodeMap = new Map<string, BaseNode>();
	for (const node of ctx.focusNodes ?? []) {
		nodeMap.set(node.id, node);
	}

	// Helper to get node label (title or summary or "未知实体")
	const getNodeLabel = (nodeId: string): string => {
		const node = nodeMap.get(nodeId);
		if (!node) return "未知实体";
		if (node.title) return node.title;
		if (node.summary) return node.summary.slice(0, 50) + (node.summary.length > 50 ? "..." : "");
		return "未知实体";
	};

	const predicateList = predicates
		.map((p) => {
			const examples = edges
				.filter((e) => e.type === p)
				.slice(0, 3)
				.map((e) => `  ${getNodeLabel(e.fromId)} -> ${getNodeLabel(e.toId)}`)
				.join("\n");
			return `- "${p}" (${edges.filter((e) => e.type === p).length} 条边)\n${examples}`;
		})
		.join("\n\n");

	return `你是一个知识图谱谓词规范化专家。请检查以下自由文本谓词，将语义相同或近似的谓词映射到标准谓词。

## 当前谓词列表
${predicateList || "（暂无谓词）"}

## 指令
1. 识别语义相同或近似的谓词（如 built_by、created_by、developed_by 可能都应统一为 developed_by）
2. 为每组相似谓词建议一个标准谓词名
3. 给出映射关系

## 规则
- 谓词名使用 snake_case
- 优先使用更通用、更标准的谓词名
- 语义不同的谓词不要合并
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			mappings: {
				type: "array",
				items: {
					type: "object",
					properties: {
						sourcePredicates: {
							type: "array",
							items: { type: "string" },
							description: "需要映射的原始谓词列表",
						},
						targetPredicate: {
							type: "string",
							description: "建议的标准谓词名",
						},
						reason: { type: "string", description: "合并理由" },
					},
					required: ["sourcePredicates", "targetPredicate", "reason"],
				},
			},
		},
		required: ["mappings"],
	};
}

import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const entities = (ctx.focusNodes ?? []).filter((n) => n.kind === "Entity");

	const entityList = entities
		.map((n) => {
			const aliases = n.attrs?.aliases ? ` 别名: ${(n.attrs.aliases as string[]).join(", ")}` : "";
			return `- [${n.id}] 名称: "${n.title ?? n.id}" | 类型: ${n.type ?? "未分类"} | 摘要: ${n.summary ?? "无"}${aliases}`;
		})
		.join("\n");

	return `你是一个知识图谱实体规范化专家。请检查以下实体列表，找出可能重复或需要合并的实体。

## 待检查的实体列表
${entityList || "（暂无实体）"}

## 指令
1. 仔细比较每对实体，识别可能指向同一现实对象的重复实体
2. 判断依据包括：
   - 名称完全相同或高度相似
   - 别名有重叠
   - 类型相同且描述指向同一对象
   - 在上下文中指代同一事物
3. 对于每组可能的重复，给出合并建议
4. 为每组重复指定保留哪个实体（preferId）以及需要合并的别名

## 约束
- 只标记真正可能重复的实体对，不要过度合并
- 不同类型的实体不应被视为重复
- 名称相似但实际不同的实体不应被合并（如"Apple"公司和"apple"水果）
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
						entityIds: {
							type: "array",
							items: { type: "string" },
							description: "重复实体的 ID 列表",
						},
						reason: { type: "string", description: "判断为重复的理由" },
						preferId: { type: "string", description: "建议保留的实体 ID" },
						mergedAliases: {
							type: "array",
							items: { type: "string" },
							description: "合并后的别名列表",
						},
					},
					required: ["entityIds", "reason", "preferId"],
				},
			},
		},
		required: ["duplicates"],
	};
}

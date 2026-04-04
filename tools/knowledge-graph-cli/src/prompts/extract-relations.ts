import type { PromptTemplateContext } from "../core/models/types";

export function buildPrompt(ctx: PromptTemplateContext): string {
	const entities = (ctx.focusNodes ?? []).filter((n) => n.kind === "Entity");
	const source = ctx.source;

	const entityList = entities
		.map((n) => `- [${n.id}] ${n.type}: ${n.title ?? n.text ?? n.id}`)
		.join("\n");

	const knownPredicates = ctx.knownSchema?.predicates ?? [];

	return `你是一个知识图谱关系提取专家。请从来源内容中提取实体间的关系候选。

## 来源
${source ? `标题: ${source.title ?? "无标题"}\n内容: ${source.text ?? source.summary ?? "无内容"}` : "（无来源）"}

## 已知实体
${entityList || "（暂无实体）"}

## 已有谓词
${knownPredicates.length > 0 ? knownPredicates.join(", ") : "（暂无）"}

## 指令
1. 从来源中识别实体间的关系
2. 尽量复用已知实体和已有谓词
3. 对每个关系判断是否应升级为 Claim（需要证据支持的可争议关系）
4. 给出置信度

## 规则
- 谓词使用 snake_case
- 只提取有文本依据的关系
- 区分事实性关系（如 member_of）和可争议断言（如 causes）
- 输出 JSON 格式`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			relations: {
				type: "array",
				items: {
					type: "object",
					properties: {
						fromEntityId: { type: "string", description: "源实体 ID" },
						toEntityId: { type: "string", description: "目标实体 ID" },
						predicate: { type: "string", description: "关系谓词" },
						shouldPromoteToClaim: { type: "boolean", description: "是否应升级为 Claim" },
						reason: { type: "string", description: "提取依据" },
						confidence: { type: "number", description: "置信度 0-1" },
					},
					required: ["fromEntityId", "toEntityId", "predicate", "confidence"],
				},
			},
		},
		required: ["relations"],
	};
}

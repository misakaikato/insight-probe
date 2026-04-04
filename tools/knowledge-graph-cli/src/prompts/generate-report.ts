import type { PromptTemplateContext } from "../core/models/types";

export interface ReportData {
	title?: string;
	claims: Array<{
		id: string;
		text: string;
		status: string;
		claimType?: string;
		confidence?: number;
		evidence: Array<{
			text: string;
			sourceId: string;
			sourceTitle: string;
			sourceUri?: string;
			sourceType: string;
		}>;
	}>;
	questions: Array<{
		id: string;
		text: string;
		priority: number;
		status: string;
	}>;
	gaps: Array<{
		id: string;
		text: string;
		gapType: string;
		severity: number;
	}>;
	sources: Array<{
		id: string;
		title: string;
		uri?: string;
		type: string;
	}>;
}

export function buildPrompt(ctx: {
	topic: string;
	data: ReportData;
}): string {
	const { topic, data } = ctx;

	const claimsSection = data.claims.length > 0
		? data.claims.map((c) => {
				const citations = c.evidence.map((e) => `[${e.sourceTitle}]`).join(", ");
				return `### 断言
**文本**: ${c.text}
**类型**: ${c.claimType ?? "未分类"}
**状态**: ${c.status}
**置信度**: ${c.confidence ?? "未知"}
**证据**:
${c.evidence.map((e) => `- "${e.text}" [来源: ${e.sourceTitle}]`).join("\n")}
**引用来源**: ${citations}`;
			}).join("\n\n")
		: "（暂无断言）";

	const questionsSection = data.questions.length > 0
		? data.questions.map((q) => `- ${q.text} (优先级: ${q.priority}, 状态: ${q.status})`).join("\n")
		: "（暂无问题）";

	const gapsSection = data.gaps.length > 0
		? data.gaps.map((g) => `- ${g.text} (类型: ${g.gapType}, 严重度: ${g.severity})`).join("\n")
		: "（暂无缺口）";

	const sourcesSection = data.sources.length > 0
		? data.sources.map((s, i) => `[${i + 1}] ${s.title}${s.uri ? `. ${s.uri}` : ""}`).join("\n")
		: "（暂无来源）";

	return `你是一个专业的研究报告撰写专家。请基于以下知识图谱数据，为研究主题 "${topic}" 撰写一份结构完整、论述深入的研究报告。

## 报告结构要求

你必须严格按照以下结构撰写报告，每个章节都需要有实质内容：

### 1. 执行摘要（约300字）
- 研究主题
- 主要发现（3-5个核心结论）
- 研究局限性

### 2. 背景介绍
- 研究主题的定义
- 为什么这个问题重要
- 当前研究状态

### 3. 核心发现
对每个主要发现：
- **发现名称**
- **详细论述**（100-200字）：包含机制解释、证据支撑、边界条件
- **关键证据引用**：引用图谱中的具体证据
- **局限性/争议**（如有）

### 4. 开放问题
列出所有未解决的 Question，分析其优先级和研究价值

### 5. 知识缺口
分析 Gap 的类型和严重度，说明为什么这些缺口重要

### 6. 参考文献
使用以下来源，标注序号引用：

${sourcesSection}

## 知识图谱数据

### 断言（Claims）

${claimsSection}

### 问题（Questions）

${questionsSection}

### 缺口（Gaps）

${gapsSection}

## 写作规范

1. **禁止直接复制粘贴图谱内容** — 必须用你自己的语言组织和扩展
2. **每个核心发现至少100字** — 包含机制解释和证据链接
3. **引用来源时使用序号** — 如 [1]、 [2]、 [1][2]
4. **保持学术写作风格** — 客观、准确、避免主观臆断
5. **标注可靠性等级** — 根据来源类型：百科/权威期刊 🟢、行业分析/多方印证 🟡、单一来源/未证实 🔴

## 输出格式

直接输出完整的 Markdown 报告，不需要额外说明。
`;
}

export function outputSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			report: {
				type: "string",
				description: "完整的研究报告 Markdown 格式",
			},
		},
		required: ["report"],
	};
}

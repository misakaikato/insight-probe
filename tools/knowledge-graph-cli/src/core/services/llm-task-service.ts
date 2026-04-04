import type {
	BaseNode,
	Edge,
	LlmTaskEnvelope,
	PromptTemplateContext,
	Task,
	TaskChecklist,
} from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { ClaimService } from "./claim-service";
import type { QuestionService } from "./question-service";
import type { GapService } from "./gap-service";
import type { EvidenceService } from "./evidence-service";
import type { TaskChecklistService } from "./task-checklist-service";
import { generateId } from "../../utils/ids";

import { buildPrompt as buildExtractEntitiesPrompt, outputSchema as extractEntitiesSchema } from "../../prompts/extract-entities";
import { buildPrompt as buildExtractObservationsPrompt, outputSchema as extractObservationsSchema } from "../../prompts/extract-observations";
import { buildPrompt as buildExtractClaimsPrompt, outputSchema as extractClaimsSchema } from "../../prompts/extract-claims";
import { buildPrompt as buildNormalizeEntitiesPrompt, outputSchema as normalizeEntitiesSchema } from "../../prompts/normalize-entities";
import { buildPrompt as buildNormalizeClaimsPrompt, outputSchema as normalizeClaimsSchema } from "../../prompts/normalize-claims";
import { buildPrompt as buildGenerateQuestionsPrompt, outputSchema as generateQuestionsSchema } from "../../prompts/generate-questions";
import { buildPrompt as buildGenerateHypothesesPrompt, outputSchema as generateHypothesesSchema } from "../../prompts/generate-hypotheses";
import { buildPrompt as buildNextSearchQueriesPrompt, outputSchema as nextSearchQueriesSchema } from "../../prompts/next-search-queries";
import { buildPrompt as buildAssessEvidencePrompt, outputSchema as assessEvidenceSchema } from "../../prompts/assess-evidence";
import { buildPrompt as buildNormalizePredicatesPrompt, outputSchema as normalizePredicatesSchema } from "../../prompts/normalize-predicates";
import { buildPrompt as buildExtractRelationsPrompt, outputSchema as extractRelationsSchema } from "../../prompts/extract-relations";
import { buildPrompt as buildGenerateReportPrompt, outputSchema as generateReportSchema } from "../../prompts/generate-report";

export class LlmTaskService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private claimService: ClaimService,
		private questionService: QuestionService,
		private gapService: GapService,
		private evidenceService: EvidenceService,
		private taskChecklistService: TaskChecklistService,
	) {}

	private buildBaseContext(taskId?: string): {
		task: Task | null;
		taskChecklist: TaskChecklist | null;
		focusNodes: BaseNode[];
		relatedClaims: BaseNode[];
		relatedEvidence: BaseNode[];
		openQuestions: BaseNode[];
	} {
		const task = taskId ? this.store.getTask(taskId) ?? null : null;
		const taskChecklist = taskId
			? this.taskChecklistService.readChecklist(taskId)
			: null;
		const focusNodes = taskId
			? this.graphService.listNodes({ taskId })
			: this.store.listNodes();
		const relatedClaims = focusNodes.filter((n) => n.kind === "Claim");
		const relatedEvidence = focusNodes.filter((n) => n.kind === "Evidence");
		const openQuestions = this.questionService.listQuestions({ status: "open", taskId });

		return { task, taskChecklist, focusNodes, relatedClaims, relatedEvidence, openQuestions };
	}

	private buildWorkflowChecklistContext(taskChecklist: TaskChecklist | null): Record<string, unknown> | undefined {
		if (!taskChecklist) return undefined;

		return {
			tasksFile: taskChecklist.tasksFile,
			summary: taskChecklist.summary,
			pendingItems: taskChecklist.pendingItems.map((item) => ({
				id: item.id,
				text: item.text,
				section: item.section,
			})),
			completedItems: taskChecklist.completedItems.map((item) => ({
				id: item.id,
				text: item.text,
				section: item.section,
			})),
		};
	}

	private withWorkflowChecklist(
		recommendedPrompt: string,
		taskChecklist: TaskChecklist | null,
	): string {
		if (!taskChecklist) return recommendedPrompt;

		const pending = taskChecklist.pendingItems.length > 0
			? taskChecklist.pendingItems
				.map((item) => `- [${item.id}] ${item.text} (${item.section})`)
				.join("\n")
			: "（暂无未完成任务项）";

		return `## 外置流程记忆\n当前调研任务的外置流程记忆保存在 \`${taskChecklist.tasksFile}\`。\n在执行本次任务时，请优先参考其中未完成的事项，并在完成对应工作后更新 checklist。\n\n### 当前未完成事项\n${pending}\n\n${recommendedPrompt}`;
	}

	private buildEnvelope(
		taskType: string,
		taskId: string | undefined,
		taskChecklist: TaskChecklist | null,
		graphContext: LlmTaskEnvelope["graphContext"],
		inputContext: Record<string, unknown>,
		instructions: string,
		recommendedPrompt: string,
		outputSchema: Record<string, unknown>,
		executionHint?: LlmTaskEnvelope["executionHint"],
	): LlmTaskEnvelope {
		const workflowChecklist = this.buildWorkflowChecklistContext(taskChecklist);
		return {
			taskType,
			taskId,
			graphContext,
			inputContext: workflowChecklist
				? { ...inputContext, workflowChecklist }
				: inputContext,
			instructions: taskChecklist
				? `${instructions}；并遵循 ${taskChecklist.tasksFile} 中的流程清单`
				: instructions,
			recommendedPrompt: this.withWorkflowChecklist(recommendedPrompt, taskChecklist),
			outputSchema,
			executionHint,
		};
	}

	buildExtractEntitiesTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.kind !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.kind === "Entity");

		// Collect known schema
		const entityTypes = [...new Set(existingEntities.map((n) => n.type).filter(Boolean) as string[])];
		const predicates = [...new Set(this.store.listEdges().map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingEntities,
			knownSchema: {
				entityTypes,
				claimTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"extract_entities",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingEntities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取实体`,
			buildExtractEntitiesPrompt(promptCtx),
			extractEntitiesSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildExtractObservationsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.kind !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.kind === "Entity");
		const existingObservations = ctx.focusNodes.filter((n) => n.kind === "Observation");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: [...existingEntities, ...existingObservations],
		};

		return this.buildEnvelope(
			"extract_observations",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: [...existingEntities, ...existingObservations],
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取观察`,
			buildExtractObservationsPrompt(promptCtx),
			extractObservationsSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildExtractClaimsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.kind !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingClaims = ctx.relatedClaims;
		const claimTypes = [...new Set(existingClaims.map((n) => n.attrs?.claimType as string).filter(Boolean))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingClaims,
			knownSchema: {
				entityTypes: [],
				claimTypes,
				predicates: [],
			},
		};

		return this.buildEnvelope(
			"extract_claims",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingClaims,
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取断言`,
			buildExtractClaimsPrompt(promptCtx),
			extractClaimsSchema(),
			{
				suggestedCommand: "kg claim add --json-in - --dir <dir>",
			},
		);
	}

	buildNormalizeEntitiesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const entities = ctx.focusNodes.filter((n) => n.kind === "Entity");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			focusNodes: entities,
		};

		return this.buildEnvelope(
			"normalize_entities",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: entities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				entityCount: entities.length,
			},
			"对知识图谱中的实体进行去重和规范化",
			buildNormalizeEntitiesPrompt(promptCtx),
			normalizeEntitiesSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>  (merge: kg node delete <duplicateId> --dir <dir>)",
			},
		);
	}

	buildNormalizeClaimsTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const claims = ctx.relatedClaims;

		const promptCtx: PromptTemplateContext = {
			...ctx,
			focusNodes: claims,
		};

		return this.buildEnvelope(
			"normalize_claims",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: claims,
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				claimCount: claims.length,
			},
			"对知识图谱中的断言进行去重和规范化",
			buildNormalizeClaimsPrompt(promptCtx),
			normalizeClaimsSchema(),
			{
				suggestedCommand: "kg claim merge <keptId> <removedId> --dir <dir>",
			},
		);
	}

	buildGenerateQuestionsTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"generate_questions",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedClaims, ...ctx.openQuestions],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				existingClaimCount: ctx.relatedClaims.length,
				existingQuestionCount: ctx.openQuestions.length,
			},
			"基于当前知识图谱生成新的研究问题",
			buildGenerateQuestionsPrompt(promptCtx),
			generateQuestionsSchema(),
			{
				suggestedCommand: "kg question add --json-in - --dir <dir>",
			},
		);
	}

	buildGenerateHypothesesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"generate_hypotheses",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedClaims, ...ctx.openQuestions],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				claimCount: ctx.relatedClaims.length,
				evidenceCount: ctx.relatedEvidence.length,
				questionCount: ctx.openQuestions.length,
			},
			"基于当前知识图谱生成假设",
			buildGenerateHypothesesPrompt(promptCtx),
			generateHypothesesSchema(),
			{
				suggestedCommand: "kg hypothesis add --json-in - --dir <dir>",
			},
		);
	}

	buildNextSearchQueriesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const gaps = this.gapService.listGaps({ taskId, status: "open" });

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"next_search_queries",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedClaims, ...ctx.openQuestions, ...gaps],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				openQuestionCount: ctx.openQuestions.length,
				gapCount: gaps.length,
				unsupportedClaimCount: ctx.relatedClaims.filter((c) => {
					const links = this.store.listEvidenceLinks(
						(l) => l.targetId === c.id && l.targetType === "node",
					);
					return links.length === 0;
				}).length,
			},
			"生成下一步搜索查询词以推进研究",
			buildNextSearchQueriesPrompt(promptCtx),
			nextSearchQueriesSchema(),
			{
				suggestedCommand: "opencli web search \"<query>\" --limit 8 -f json -o <dir>/search_results/r<n>_q<m>_opencli.json",
			},
		);
	}

	buildAssessEvidenceTask(claimId: string): LlmTaskEnvelope {
		const claim = this.claimService.getClaim(claimId);
		if (!claim) throw new Error(`断言不存在: ${claimId}`);

		const { evidence, links } = this.evidenceService.listEvidenceByTarget(claimId);
		const relatedClaims = this.store
			.listEdges((e) => e.fromId === claimId || e.toId === claimId)
			.map((edge) => {
				const otherId = edge.fromId === claimId ? edge.toId : edge.fromId;
				return this.store.getNode(otherId);
			})
			.filter((n): n is BaseNode => n !== undefined && n.kind === "Claim");

		const taskIds = this.store.getNodeTaskIds(claimId);
		const task = taskIds.length > 0 ? this.store.getTask(taskIds[0]) ?? null : null;

		const taskChecklist = task?.id
			? this.taskChecklistService.readChecklist(task.id)
			: null;

		const promptCtx: PromptTemplateContext = {
			task,
			taskChecklist,
			focusNodes: [claim, ...relatedClaims],
			relatedClaims,
			relatedEvidence: evidence,
		};

		return this.buildEnvelope(
			"assess_evidence",
			task?.id,
			taskChecklist,
			{
				focusNodeIds: [claimId],
				relatedNodes: relatedClaims,
				relatedEdges: [],
				relatedEvidence: evidence,
			},
			{
				claimId,
				claimText: claim.text,
				evidenceCount: evidence.length,
				linkCount: links.length,
				supportCount: links.filter((l) => l.role === "supports").length,
				contradictCount: links.filter((l) => l.role === "contradicts").length,
			},
			`评估断言 "${claim.text ?? claim.title ?? claimId}" 的证据状况`,
			buildAssessEvidencePrompt(promptCtx),
			assessEvidenceSchema(),
			{
				suggestedCommand: "kg claim set-status <claimId> <status> --dir <dir>",
			},
		);
	}

	buildNormalizePredicatesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const edges = this.store.listEdges();
		const predicates = [...new Set(edges.map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			relatedEdges: edges,
			knownSchema: {
				entityTypes: [],
				claimTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"normalize_predicates",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: ctx.focusNodes,
				relatedEdges: edges,
				relatedEvidence: [],
			},
			{
				predicateCount: predicates.length,
				edgeCount: edges.length,
			},
			"对知识图谱中的谓词进行规范化映射",
			buildNormalizePredicatesPrompt(promptCtx),
			normalizePredicatesSchema(),
			{
				suggestedCommand: "kg edge delete <oldEdgeId> --dir <dir> && kg edge create --from <fromId> --type <normalizedPredicate> --to <toId> --dir <dir>",
			},
		);
	}

	buildExtractRelationsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.kind !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.kind === "Entity");
		const predicates = [...new Set(this.store.listEdges().map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingEntities,
			knownSchema: {
				entityTypes: [...new Set(existingEntities.map((n) => n.type).filter(Boolean) as string[])],
				claimTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"extract_relations",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingEntities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取关系`,
			buildExtractRelationsPrompt(promptCtx),
			extractRelationsSchema(),
			{
				suggestedCommand: "kg edge create --from <entityId1> --type <relation> --to <entityId2> --dir <dir>",
			},
		);
	}

	buildGenerateReportTask(taskId?: string, topic?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const scopedNodes = taskId ? ctx.focusNodes : this.store.listNodes();

		// Get all claims with their evidence chains
		const claims = scopedNodes.filter((n) => n.kind === "Claim");
		const claimsWithEvidence = claims.map((claim) => {
			const evidenceLinks = this.store.listEvidenceLinks(
				(l) => l.targetId === claim.id && l.targetType === "node" && l.role === "supports",
			);
			const evidence = evidenceLinks.map((link) => {
				const ev = this.store.getNode(link.evidenceId);
				const sourceId = ev?.attrs?.sourceId as string | undefined;
				const source = sourceId ? this.store.getNode(sourceId) : null;
				return {
					text: ev?.text ?? "",
					sourceId: sourceId ?? "",
					sourceTitle: source?.title ?? sourceId ?? "未知来源",
					sourceUri: source?.attrs?.uri as string | undefined,
					sourceType: source?.type ?? "unknown",
				};
			});

			return {
				id: claim.id,
				text: claim.text ?? "",
				status: claim.status ?? "unknown",
				claimType: claim.attrs?.claimType as string | undefined,
				confidence: claim.attrs?.confidence as number | undefined,
				evidence,
			};
		});

		// Get all questions
		const questions = scopedNodes.filter((n) => n.kind === "Question");
		const questionList = questions.map((q) => ({
			id: q.id,
			text: q.text ?? "",
			priority: (q.attrs?.priority as number) ?? 0.5,
			status: q.status ?? "unknown",
		}));

		// Get all gaps
		const gaps = this.gapService.listGaps({ taskId, status: "open" });
		const gapList = gaps.map((g) => ({
			id: g.id,
			text: g.text ?? "",
			gapType: String(g.attrs?.gapType ?? "unknown"),
			severity: Number(g.attrs?.severity ?? 0.5),
		}));

		// Get all sources
		const sources = scopedNodes.filter((n) => n.kind === "Source");
		const sourceList = sources.map((s) => ({
			id: s.id,
			title: s.title ?? s.id,
			uri: s.attrs?.uri as string | undefined,
			type: s.type ?? "unknown",
		}));

		const reportData = {
			claims: claimsWithEvidence,
			questions: questionList,
			gaps: gapList,
			sources: sourceList,
		};

		const prompt = buildGenerateReportPrompt({ topic: topic ?? "研究主题", data: reportData });

		return this.buildEnvelope(
			"generate_report",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: claims.map((c) => c.id),
				relatedNodes: [...questions, ...gaps],
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				claimsCount: claims.length,
				questionsCount: questions.length,
				gapsCount: gaps.length,
				sourcesCount: sources.length,
			},
			`生成研究报告：${topic ?? "研究主题"}`,
			prompt,
			generateReportSchema(),
			{
				suggestedCommand: "将 LLM 输出的报告保存为 final_report.md",
			},
		);
	}
}

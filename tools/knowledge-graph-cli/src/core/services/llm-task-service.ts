import type {
	BaseNode,
	Edge,
	LlmTaskEnvelope,
	PromptTemplateContext,
	Task,
} from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { ClaimService } from "./claim-service";
import type { QuestionService } from "./question-service";
import type { GapService } from "./gap-service";
import type { EvidenceService } from "./evidence-service";
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

export class LlmTaskService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private claimService: ClaimService,
		private questionService: QuestionService,
		private gapService: GapService,
		private evidenceService: EvidenceService,
	) {}

	private buildBaseContext(taskId?: string): {
		task: Task | null;
		focusNodes: BaseNode[];
		relatedClaims: BaseNode[];
		relatedEvidence: BaseNode[];
		openQuestions: BaseNode[];
	} {
		const task = taskId ? this.store.getTask(taskId) ?? null : null;
		const focusNodes = taskId
			? this.store.getTaskNodeIds(taskId).map((id) => this.store.getNode(id)).filter((n): n is BaseNode => n !== undefined)
			: this.store.listNodes();
		const relatedClaims = focusNodes.filter((n) => n.kind === "Claim");
		const relatedEvidence = focusNodes.filter((n) => n.kind === "Evidence");
		const openQuestions = this.questionService.listQuestions({ status: "open", taskId });

		return { task, focusNodes, relatedClaims, relatedEvidence, openQuestions };
	}

	private buildEnvelope(
		taskType: string,
		taskId: string | undefined,
		graphContext: LlmTaskEnvelope["graphContext"],
		inputContext: Record<string, unknown>,
		instructions: string,
		recommendedPrompt: string,
		outputSchema: Record<string, unknown>,
	): LlmTaskEnvelope {
		return {
			taskType,
			taskId,
			graphContext,
			inputContext,
			instructions,
			recommendedPrompt,
			outputSchema,
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

		const promptCtx: PromptTemplateContext = {
			task,
			focusNodes: [claim, ...relatedClaims],
			relatedClaims,
			relatedEvidence: evidence,
		};

		return this.buildEnvelope(
			"assess_evidence",
			task?.id,
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
		);
	}
}

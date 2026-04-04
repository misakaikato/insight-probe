import type { BaseNode, LlmTaskEnvelope } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { LlmTaskService } from "./llm-task-service";
import type { QuestionService } from "./question-service";
import type { GapService } from "./gap-service";
import type { TaskChecklistService } from "./task-checklist-service";

export type ResearchPhase = "search" | "extract" | "normalize" | "gap_detection" | "done";

export interface ResearchContinueResult {
	phase: ResearchPhase;
	nextQueries: LlmTaskEnvelope | null;
	stats: {
		nodeCountByKind: Record<string, number>;
		edgeCountByType: Record<string, number>;
		totalNodes: number;
		totalEdges: number;
	};
	openQuestions: BaseNode[];
	gaps: BaseNode[];
	workflowChecklist?: {
		tasksFile: string;
		summary: {
			total: number;
			completed: number;
			pending: number;
		};
		pendingItems: Array<{
			id: string;
			text: string;
			section: string;
		}>;
	};
	shouldContinue: boolean;
	round: number;
	message: string;
}

export class ResearchService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private llmTask: LlmTaskService,
		private questionService: QuestionService,
		private gapService: GapService,
		private taskChecklistService: TaskChecklistService,
	) {}

	/**
	 * Get the current research round from the Task node.
	 * Returns the next round number to plan.
	 */
	private getCurrentRound(taskId: string): number {
		const task = this.store.getTask(taskId);
		if (!task) return 1;
		return ((task.attrs?.round as number) ?? 0) + 1;
	}

	/**
	 * Record the round that has just been planned.
	 */
	private recordRound(taskId: string, round: number): number {
		const task = this.store.getTask(taskId);
		if (!task) return 1;
		this.store.updateTask(taskId, {
			attrs: { ...task.attrs, round },
		});
		this.store.save();
		return round;
	}

	/**
	 * Determine the current phase based on graph state.
	 */
	private determinePhase(openQuestions: BaseNode[], gaps: BaseNode[], stats: ReturnType<GraphService["getStats"]>): ResearchPhase {
		// If the graph is empty, we need to start with search
		if (stats.totalNodes === 0) {
			return "search";
		}

		// If there are open questions or gaps, we need more research
		if (openQuestions.length > 0 || gaps.length > 0) {
			// Check if we have sources to extract from
			const sourceCount = stats.nodeCountByKind["Source"] ?? 0;
			const evidenceCount = stats.nodeCountByKind["Evidence"] ?? 0;

			if (sourceCount === 0) {
				return "search";
			}
			if (evidenceCount < sourceCount * 0.5) {
				return "extract";
			}
			return "gap_detection";
		}

		return "done";
	}

	/**
	 * Main entry point: continue the research loop.
	 */
	continue(taskId: string, maxRounds: number = 10): ResearchContinueResult {
		// Get current round
		const currentRound = this.getCurrentRound(taskId);

		// Check if we've exceeded max rounds
		if (currentRound > maxRounds) {
			return {
				phase: "done",
				nextQueries: null,
				stats: this.graphService.getStats(taskId),
				openQuestions: [],
				gaps: [],
				shouldContinue: false,
				round: currentRound,
				message: `已达到最大轮次限制 (${maxRounds})，研究收敛`,
			};
		}

		// Build next search queries task (does not execute, just builds the envelope)
		const nextQueriesEnvelope = this.llmTask.buildNextSearchQueriesTask(taskId);

		// Get current stats
		const stats = this.graphService.getStats(taskId);

		// Get open questions
		const openQuestions = this.questionService.listQuestions({ status: "open", taskId });

		// Get gaps
		const gaps = this.gapService.listGaps({ taskId, status: "open" });

		// Determine phase
		const phase = this.determinePhase(openQuestions, gaps, stats);
		const checklist = this.taskChecklistService.syncResearchRoundPlan({
			taskId,
			round: currentRound,
			phase,
			openQuestions,
			gaps,
			hasNextQueries: nextQueriesEnvelope !== null,
		});

		// Determine if we should continue
		const shouldContinue = phase !== "done" && currentRound <= maxRounds;

		// Record the round that has just been planned
		this.recordRound(taskId, currentRound);

		// Build message
		const message = this.buildPhaseMessage(phase, openQuestions, gaps, stats, currentRound);

		return {
			phase,
			nextQueries: nextQueriesEnvelope,
			stats,
			openQuestions,
			gaps,
			workflowChecklist: {
				tasksFile: checklist.tasksFile,
				summary: checklist.summary,
				pendingItems: checklist.pendingItems.map((item) => ({
					id: item.id,
					text: item.text,
					section: item.section,
				})),
			},
			shouldContinue,
			round: currentRound,
			message,
		};
	}

	private buildPhaseMessage(
		phase: ResearchPhase,
		openQuestions: BaseNode[],
		gaps: BaseNode[],
		stats: ReturnType<GraphService["getStats"]>,
		round: number,
	): string {
		switch (phase) {
			case "search":
				return `[第 ${round} 轮] 需要进行搜索以推进研究。当前有 ${openQuestions.length} 个待解决问题和 ${gaps.length} 个缺口。请使用 nextQueries 中的搜索词进行搜索。`;
			case "extract":
				return `[第 ${round} 轮] 已有 ${stats.nodeCountByKind["Source"] ?? 0} 个来源，需要提取实体/断言。请对已获取的来源执行提取任务。`;
			case "normalize":
				return `[第 ${round} 轮] 需要对知识图谱进行规范化（去重、合并相似节点）。`;
			case "gap_detection":
				return `[第 ${round} 轮] 检测到 ${gaps.length} 个知识缺口，需要生成搜索查询来填补这些缺口。`;
			case "done":
				return `[第 ${round} 轮] 研究已收敛。图谱包含 ${stats.totalNodes} 个节点和 ${stats.totalEdges} 条边。`;
		}
	}
}

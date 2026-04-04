import type { BaseNode } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { now } from "../../utils/time";

export class GapService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	/**
	 * Build a unique key for an existing gap to detect duplicates.
	 */
	private buildGapKey(node: BaseNode): string {
		return `${node.attrs?.gapType ?? "unknown"}:${node.attrs?.relatedNodeId ?? node.id}`;
	}

	/**
	 * Detect gaps, avoiding duplicates based on gapType + relatedNodeId.
	 */
	detectGaps(taskId?: string): BaseNode[] {
		const claims = this.graphService.listNodes({ kind: "Claim", taskId });
		const questions = this.graphService.listNodes({ kind: "Question", taskId });

		// Collect existing gap keys to avoid duplicates
		const existingGaps = this.graphService.listNodes({ kind: "Gap", taskId });
		const existingGapKeys = new Set(existingGaps.map((g) => this.buildGapKey(g)));

		const gaps: BaseNode[] = [];

		// Check claims without evidence
		for (const claim of claims) {
			const evidenceLinks = this.store.listEvidenceLinks(
				(l) => l.targetId === claim.id && l.targetType === "node",
			);

			const gapKey = `no_evidence:${claim.id}`;
			if (evidenceLinks.length === 0 && !existingGapKeys.has(gapKey)) {
				const gap = this.graphService.upsertNode({
					kind: "Gap",
					text: `断言 "${claim.text ?? claim.title ?? claim.id}" 无任何证据支持`,
					status: "open",
					attrs: {
						gapType: "no_evidence",
						severity: 0.8,
						relatedNodeId: claim.id,
						taskId,
					},
				});
				gaps.push(gap);
				existingGapKeys.add(gapKey); // prevent duplicate within same run
			} else {
				// Check for insufficient evidence: only supports, no contradicts, single source
				const supports = evidenceLinks.filter((l) => l.role === "supports");
				const contradicts = evidenceLinks.filter((l) => l.role === "contradicts");
				const sourceIds = new Set<string>();

				for (const link of evidenceLinks) {
					const evidence = this.store.getNode(link.evidenceId);
					if (evidence?.attrs?.sourceId) {
						sourceIds.add(evidence.attrs.sourceId as string);
					}
				}

				const insufficientKey = `insufficient_evidence:${claim.id}`;
				if (supports.length > 0 && contradicts.length === 0 && sourceIds.size <= 1 && !existingGapKeys.has(insufficientKey)) {
					const gap = this.graphService.upsertNode({
						kind: "Gap",
						text: `断言 "${claim.text ?? claim.title ?? claim.id}" 证据不充分：仅有 ${sourceIds.size} 个来源的支持证据，无反驳证据`,
						status: "open",
						attrs: {
							gapType: "insufficient_evidence",
							severity: 0.5,
							relatedNodeId: claim.id,
							sourceCount: sourceIds.size,
							taskId,
						},
					});
					gaps.push(gap);
					existingGapKeys.add(insufficientKey);
				}
			}
		}

		// Check for long-standing open questions
		for (const question of questions) {
			if (question.status !== "open") continue;
			const createdAt = new Date(question.createdAt);
			const daysSinceCreation =
				(Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
			const unresolvedKey = `unresolved_question:${question.id}`;
			if (daysSinceCreation > 3 && !existingGapKeys.has(unresolvedKey)) {
				const gap = this.graphService.upsertNode({
					kind: "Gap",
					text: `问题 "${question.text ?? question.title ?? question.id}" 已保持 open 状态 ${Math.floor(daysSinceCreation)} 天未解决`,
					status: "open",
					attrs: {
						gapType: "unresolved_question",
						severity: 0.6,
						relatedNodeId: question.id,
						daysOpen: Math.floor(daysSinceCreation),
						taskId,
					},
				});
				gaps.push(gap);
				existingGapKeys.add(unresolvedKey);
			}
		}

		return gaps;
	}

	listGaps(filters: { taskId?: string; status?: string }): BaseNode[] {
		return this.graphService.listNodes({
			kind: "Gap",
			status: filters.status,
			taskId: filters.taskId,
		});
	}
}

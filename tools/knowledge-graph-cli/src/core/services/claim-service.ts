import type { BaseNode, ClaimStatus } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";

export class ClaimService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	addClaim(data: {
		text: string;
		claimType?: string;
		status?: ClaimStatus;
		confidence?: number;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		return this.graphService.upsertNode({
			kind: "Claim",
			text: data.text,
			status: data.status ?? "proposed",
			confidence: data.confidence,
			attrs: {
				claimType: data.claimType,
				...data.attrs,
			},
			taskId: data.taskId,
		});
	}

	getClaim(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.kind === "Claim") return node;
		return undefined;
	}

	listClaims(filters: { status?: string; taskId?: string }): BaseNode[] {
		return this.graphService.listNodes({
			kind: "Claim",
			status: filters.status,
			taskId: filters.taskId,
		});
	}

	setClaimStatus(id: string, status: ClaimStatus): BaseNode | undefined {
		const VALID_STATUSES: ClaimStatus[] = ["proposed","supported","weakly_supported","contested","contradicted","deprecated","superseded"];
		if (!VALID_STATUSES.includes(status)) {
			throw new Error(`Invalid claim status: ${status}`);
		}
		const claim = this.store.getNode(id);
		if (!claim) return undefined;
		if (claim.kind !== "Claim") {
			throw new Error(`节点 ${id} 不是 Claim 类型`);
		}
		return this.graphService.upsertNode({
			...claim,
			status,
		});
	}

	getConflicts(claimId: string): {
		claim: BaseNode;
		contradicting: BaseNode[];
		supporting: BaseNode[];
	} {
		const claim = this.store.getNode(claimId);
		if (!claim) {
			throw new Error(`断言不存在: ${claimId}`);
		}
		if (claim.kind !== "Claim") {
			throw new Error(`节点 ${claimId} 不是 Claim 类型`);
		}

		const links = this.store.listEvidenceLinks(
			(l) => l.targetId === claimId && l.targetType === "node",
		);

		const contradicting: BaseNode[] = [];
		const supporting: BaseNode[] = [];

		for (const link of links) {
			const evidence = this.store.getNode(link.evidenceId);
			if (!evidence) continue;
			if (link.role === "contradicts") {
				contradicting.push(evidence);
			} else if (link.role === "supports") {
				supporting.push(evidence);
			}
		}

		return { claim, contradicting, supporting };
	}

	mergeClaims(id1: string, id2: string): BaseNode {
		const claim1 = this.store.getNode(id1);
		const claim2 = this.store.getNode(id2);
		if (!claim1) throw new Error(`断言不存在: ${id1}`);
		if (!claim2) throw new Error(`断言不存在: ${id2}`);
		if (claim1.kind !== "Claim") throw new Error(`节点 ${id1} 不是 Claim 类型`);
		if (claim2.kind !== "Claim") throw new Error(`节点 ${id2} 不是 Claim 类型`);

		// Merge attrs
		const mergedAttrs: Record<string, unknown> = {
			...claim2.attrs,
			...claim1.attrs,
		};

		// Merge aliases for claim text
		const texts = [claim1.text, claim2.text].filter(Boolean);
		if (texts.length > 1) {
			mergedAttrs.altTexts = texts.slice(1);
		}

		// Take higher confidence
		const mergedConfidence =
			claim1.confidence !== undefined && claim2.confidence !== undefined
				? Math.max(claim1.confidence, claim2.confidence)
				: claim1.confidence ?? claim2.confidence;

		// Update claim1 with merged data
		const merged = this.graphService.upsertNode({
			...claim1,
			confidence: mergedConfidence,
			attrs: mergedAttrs,
		});

		// Transfer all edges from id2 to id1
		const edgesFrom2 = this.store.listEdges(
			(e) => e.fromId === id2 || e.toId === id2,
		);
		for (const edge of edgesFrom2) {
			this.store.deleteEdge(edge.id);
			this.graphService.createEdge({
				fromId: edge.fromId === id2 ? id1 : edge.fromId,
				toId: edge.toId === id2 ? id1 : edge.toId,
				type: edge.type,
				directed: edge.directed,
				confidence: edge.confidence,
				attrs: edge.attrs,
			});
		}

		// Transfer evidence links from id2 to id1
		const evidenceLinksFor2 = this.store.listEvidenceLinks(
			(l) => l.targetId === id2 && l.targetType === "node",
		);
		for (const link of evidenceLinksFor2) {
			this.store.deleteEvidenceLink(link.id);
			this.store.createEvidenceLink({
				...link,
				id: generateId("evidenceLink"),
				targetId: id1,
				createdAt: now(),
			});
		}

		// Transfer evidence links where id2 is the evidence
		const evidenceLinksAsEvidence = this.store.listEvidenceLinks(
			(l) => l.evidenceId === id2,
		);
		for (const link of evidenceLinksAsEvidence) {
			this.store.deleteEvidenceLink(link.id);
			this.store.createEvidenceLink({
				...link,
				id: generateId("evidenceLink"),
				evidenceId: id1,
				createdAt: now(),
			});
		}

		// Delete claim2
		this.graphService.deleteNode(id2);

		this.store.addOpLog({
			id: generateId("opLog"),
			opType: "merge_claims",
			actor: "human",
			payload: { keptId: id1, removedId: id2 },
			createdAt: now(),
		});
		this.store.save();

		return merged;
	}
}

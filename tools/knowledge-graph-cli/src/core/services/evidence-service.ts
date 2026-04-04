import type { BaseNode, EvidenceLink, EvidenceLinkRole, EvidenceLinkTargetType } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";

export class EvidenceService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	addSource(data: {
		title: string;
		uri?: string;
		sourceType: string;
		attrs?: Record<string, unknown>;
	}): BaseNode {
		return this.graphService.upsertNode({
			kind: "Source",
			title: data.title,
			type: data.sourceType,
			attrs: {
				uri: data.uri,
				...data.attrs,
			},
		});
	}

	getSource(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.kind === "Source") return node;
		return undefined;
	}

	addEvidence(data: {
		sourceId: string;
		snippet: string;
		quote?: string;
		locator?: Record<string, unknown>;
		confidence?: number;
		attrs?: Record<string, unknown>;
	}): BaseNode {
		const source = this.store.getNode(data.sourceId);
		if (!source) {
			throw new Error(`来源节点不存在: ${data.sourceId}`);
		}
		if (source.kind !== "Source") {
			throw new Error(`节点 ${data.sourceId} 不是 Source 类型，而是 ${source.kind}`);
		}

		return this.graphService.upsertNode({
			kind: "Evidence",
			text: data.snippet,
			confidence: data.confidence,
			attrs: {
				sourceId: data.sourceId,
				snippet: data.snippet,
				quote: data.quote,
				locator: data.locator,
				...data.attrs,
			},
		});
	}

	getEvidence(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.kind === "Evidence") return node;
		return undefined;
	}

	linkEvidence(
		evidenceId: string,
		targetType: "node" | "edge",
		targetId: string,
		role: EvidenceLinkRole,
		confidence?: number,
	): EvidenceLink {
		const evidence = this.store.getNode(evidenceId);
		if (!evidence) {
			throw new Error(`证据节点不存在: ${evidenceId}`);
		}
		if (evidence.kind !== "Evidence") {
			throw new Error(`节点 ${evidenceId} 不是 Evidence 类型`);
		}

		if (targetType === "node") {
			const target = this.store.getNode(targetId);
			if (!target) {
				throw new Error(`目标节点不存在: ${targetId}`);
			}
		} else {
			const target = this.store.getEdge(targetId);
			if (!target) {
				throw new Error(`目标边不存在: ${targetId}`);
			}
		}

		const timestamp = now();
		const link: EvidenceLink = {
			id: generateId("evidenceLink"),
			evidenceId,
			targetType,
			targetId,
			role,
			confidence,
			createdAt: timestamp,
		};

		this.store.createEvidenceLink(link);
		this.store.addOpLog({
			id: generateId("opLog"),
			opType: "link_evidence",
			actor: "human",
			payload: { linkId: link.id, evidenceId, targetType, targetId, role },
			createdAt: timestamp,
		});
		this.store.save();
		return link;
	}

	listEvidenceByTarget(targetId: string, role?: EvidenceLinkRole): { evidence: BaseNode[]; links: EvidenceLink[] } {
		const links = this.store.listEvidenceLinks(
			(l) => l.targetId === targetId && (!role || l.role === role),
		);
		const evidence: BaseNode[] = [];
		for (const link of links) {
			const node = this.store.getNode(link.evidenceId);
			if (node) {
				evidence.push(node);
			}
		}
		return { evidence, links };
	}

	getSourceForEvidence(evidenceId: string): BaseNode | undefined {
		const evidence = this.store.getNode(evidenceId);
		if (!evidence || evidence.kind !== "Evidence") return undefined;
		const sourceId = evidence.attrs?.sourceId as string | undefined;
		if (!sourceId) return undefined;
		return this.store.getNode(sourceId);
	}
}

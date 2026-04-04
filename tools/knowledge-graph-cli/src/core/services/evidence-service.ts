import type { BaseNode, EvidenceLink, EvidenceLinkRole, EvidenceLinkTargetType } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";
import { validateEvidenceLink } from "../schemas";

export class EvidenceService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	private getNodeTaskIds(node: BaseNode): string[] {
		const taskIds = new Set<string>(this.store.getNodeTaskIds(node.id));
		const attrTaskId = node.attrs?.taskId;
		if (typeof attrTaskId === "string" && attrTaskId.trim().length > 0) {
			taskIds.add(attrTaskId);
		}

		const attrTaskIds = node.attrs?.taskIds;
		if (Array.isArray(attrTaskIds)) {
			for (const id of attrTaskIds) {
				if (typeof id === "string" && id.trim().length > 0) {
					taskIds.add(id);
				}
			}
		}

		return [...taskIds];
	}

	addSource(data: {
		title: string;
		uri?: string;
		sourceType: string;
		text?: string;
		summary?: string;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		return this.graphService.upsertNode({
			kind: "Source",
			title: data.title,
			type: data.sourceType,
			text: data.text,
			summary: data.summary,
			attrs: {
				uri: data.uri,
				...data.attrs,
			},
			taskId: data.taskId,
		});
	}

	getSource(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.kind === "Source") return node;
		return undefined;
	}

	updateSource(id: string, patch: {
		title?: string;
		uri?: string;
		sourceType?: string;
		text?: string;
		summary?: string;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		const source = this.getSource(id);
		if (!source) {
			throw new Error(`来源节点不存在: ${id}`);
		}

		const attrs: Record<string, unknown> = {
			...source.attrs,
			...patch.attrs,
		};
		if (patch.uri !== undefined) {
			attrs.uri = patch.uri;
		}

		return this.graphService.upsertNode({
			...source,
			title: patch.title ?? source.title,
			type: patch.sourceType ?? source.type,
			text: patch.text ?? source.text,
			summary: patch.summary ?? source.summary,
			attrs,
			taskId: patch.taskId ?? this.getNodeTaskIds(source),
		});
	}

	addEvidence(data: {
		sourceId: string;
		snippet: string;
		quote?: string;
		locator?: Record<string, unknown>;
		confidence?: number;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		const source = this.store.getNode(data.sourceId);
		if (!source) {
			throw new Error(`来源节点不存在: ${data.sourceId}`);
		}
		if (source.kind !== "Source") {
			throw new Error(`节点 ${data.sourceId} 不是 Source 类型，而是 ${source.kind}`);
		}

		const inheritedTaskIds = this.getNodeTaskIds(source);

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
			taskId: data.taskId ?? inheritedTaskIds,
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
		const link: EvidenceLink = validateEvidenceLink({
			id: generateId("evidenceLink"),
			evidenceId,
			targetType,
			targetId,
			role,
			confidence,
			createdAt: timestamp,
		});

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

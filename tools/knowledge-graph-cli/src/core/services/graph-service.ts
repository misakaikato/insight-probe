import type { BaseNode, Edge, EvidenceLink, NodeKind, OpLog } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";
import { validateEdge, validateNode } from "../schemas";

export class GraphService {
	constructor(private store: GraphStore) {}

	private normalizeTaskIds(taskId?: string | string[], attrs?: Record<string, unknown>): string[] {
		const taskIds = new Set<string>();

		const collect = (value: unknown) => {
			if (typeof value === "string" && value.trim().length > 0) {
				taskIds.add(value);
				return;
			}

			if (Array.isArray(value)) {
				for (const item of value) {
					if (typeof item === "string" && item.trim().length > 0) {
						taskIds.add(item);
					}
				}
			}
		};

		collect(taskId);
		collect(attrs?.taskId);
		collect(attrs?.taskIds);

		return [...taskIds];
	}

	private ensureTaskExists(taskId: string): void {
		if (!this.store.getTask(taskId)) {
			throw new Error(`任务不存在: ${taskId}`);
		}
	}

	private belongsToTask(node: BaseNode, taskId: string): boolean {
		if (this.store.getNodeTaskIds(node.id).includes(taskId)) {
			return true;
		}

		const attrTaskId = node.attrs?.taskId;
		if (typeof attrTaskId === "string" && attrTaskId === taskId) {
			return true;
		}

		const attrTaskIds = node.attrs?.taskIds;
		if (
			Array.isArray(attrTaskIds) &&
			attrTaskIds.some((id) => typeof id === "string" && id === taskId)
		) {
			return true;
		}

		return false;
	}

	upsertNode(data: Partial<BaseNode> & { id?: string; kind: NodeKind; taskId?: string | string[] }): BaseNode {
		const timestamp = now();
		let node: BaseNode;
		const taskIds = this.normalizeTaskIds(data.taskId, data.attrs);

		if (data.id) {
			const existing = this.store.getNode(data.id);
			if (existing) {
				node = {
					...existing,
					...data,
					attrs: { ...existing.attrs, ...data.attrs },
					updatedAt: timestamp,
				};
			} else {
				node = {
					id: data.id,
					kind: data.kind,
					type: data.type,
					title: data.title,
					text: data.text,
					summary: data.summary,
					status: data.status,
					confidence: data.confidence,
					attrs: data.attrs ?? {},
					createdAt: timestamp,
					updatedAt: timestamp,
				};
			}
		} else {
			node = {
				id: generateId(data.kind),
				kind: data.kind,
				type: data.type,
				title: data.title,
				text: data.text,
				summary: data.summary,
				status: data.status,
				confidence: data.confidence,
				attrs: data.attrs ?? {},
				createdAt: timestamp,
				updatedAt: timestamp,
			};
		}

		node = validateNode(node);

		for (const taskId of taskIds) {
			this.ensureTaskExists(taskId);
		}

		this.store.upsertNode(node);
		for (const taskId of taskIds) {
			this.store.linkNodeToTask(node.id, taskId, generateId("nodeTaskLink"));
		}
		this.store.addOpLog({
			id: generateId("opLog"),
			opType: data.id && this.store.getNode(data.id) ? "update_node" : "create_node",
			actor: "human",
			payload: { nodeId: node.id, kind: node.kind },
			createdAt: timestamp,
		});
		this.store.save();
		return node;
	}

	getNode(id: string): BaseNode | undefined {
		return this.store.getNode(id);
	}

	listNodes(filters?: { kind?: string; status?: string; taskId?: string }): BaseNode[] {
		return this.store.listNodes((n) => {
			if (filters?.kind && n.kind !== filters.kind) return false;
			if (filters?.status && n.status !== filters.status) return false;
			if (filters?.taskId && !this.belongsToTask(n, filters.taskId)) {
				return false;
			}
			return true;
		});
	}

	deleteNode(id: string): boolean {
		const result = this.store.deleteNode(id);
		if (result) {
			this.store.addOpLog({
				id: generateId("opLog"),
				opType: "delete_node",
				actor: "human",
				payload: { nodeId: id },
				createdAt: now(),
			});
			this.store.save();
		}
		return result;
	}

	createEdge(data: {
		fromId: string;
		toId: string;
		type: string;
		directed?: boolean;
		confidence?: number;
		attrs?: Record<string, unknown>;
	}): Edge {
		const fromNode = this.store.getNode(data.fromId);
		if (!fromNode) {
			throw new Error(`源节点不存在: ${data.fromId}`);
		}
		const toNode = this.store.getNode(data.toId);
		if (!toNode) {
			throw new Error(`目标节点不存在: ${data.toId}`);
		}

		const timestamp = now();
		const edge: Edge = {
			id: generateId("edge"),
			type: data.type,
			fromId: data.fromId,
			toId: data.toId,
			directed: data.directed ?? true,
			confidence: data.confidence,
			attrs: data.attrs ?? {},
			createdAt: timestamp,
			updatedAt: timestamp,
		};

		const validatedEdge = validateEdge(edge);

		this.store.createEdge(validatedEdge);
		this.store.addOpLog({
			id: generateId("opLog"),
			opType: "create_edge",
			actor: "human",
			payload: {
				edgeId: validatedEdge.id,
				type: validatedEdge.type,
				fromId: validatedEdge.fromId,
				toId: validatedEdge.toId,
			},
			createdAt: timestamp,
		});
		this.store.save();
		return validatedEdge;
	}

	getEdge(id: string): Edge | undefined {
		return this.store.getEdge(id);
	}

	listEdges(filters?: { fromId?: string; toId?: string; type?: string }): Edge[] {
		return this.store.listEdges((e) => {
			if (filters?.fromId && e.fromId !== filters.fromId) return false;
			if (filters?.toId && e.toId !== filters.toId) return false;
			if (filters?.type && e.type !== filters.type) return false;
			return true;
		});
	}

	deleteEdge(id: string): boolean {
		const result = this.store.deleteEdge(id);
		if (result) {
			this.store.addOpLog({
				id: generateId("opLog"),
				opType: "delete_edge",
				actor: "human",
				payload: { edgeId: id },
				createdAt: now(),
			});
			this.store.save();
		}
		return result;
	}

	getNeighbors(nodeId: string, depth: number = 1): { nodes: BaseNode[]; edges: Edge[] } {
		const visitedNodes = new Set<string>();
		const collectedNodes: BaseNode[] = [];
		const collectedEdges: Edge[] = [];

		let frontier = new Set<string>([nodeId]);
		visitedNodes.add(nodeId);

		for (let d = 0; d < depth; d++) {
			const nextFrontier = new Set<string>();

			for (const currentId of frontier) {
				const edges = this.store.listEdges(
					(e) => e.fromId === currentId || e.toId === currentId,
				);

				for (const edge of edges) {
					if (!collectedEdges.some((e) => e.id === edge.id)) {
						collectedEdges.push(edge);
					}

					const neighborId = edge.fromId === currentId ? edge.toId : edge.fromId;
					if (!visitedNodes.has(neighborId)) {
						visitedNodes.add(neighborId);
						nextFrontier.add(neighborId);
						const neighborNode = this.store.getNode(neighborId);
						if (neighborNode) {
							collectedNodes.push(neighborNode);
						}
					}
				}
			}

			frontier = nextFrontier;
		}

		return { nodes: collectedNodes, edges: collectedEdges };
	}

	/**
	 * Find shortest path between two nodes using BFS.
	 */
	findPath(fromId: string, toId: string, maxDepth: number = 4): { nodes: BaseNode[]; edges: Edge[] } | null {
		const fromNode = this.store.getNode(fromId);
		if (!fromNode) throw new Error(`源节点不存在: ${fromId}`);
		const toNode = this.store.getNode(toId);
		if (!toNode) throw new Error(`目标节点不存在: ${toId}`);
		if (fromId === toId) return { nodes: [fromNode], edges: [] };

		// BFS with parent tracking
		const visited = new Set<string>([fromId]);
		const parent = new Map<string, { nodeId: string; edgeId: string }>();

		let frontier = new Set<string>([fromId]);

		for (let d = 0; d < maxDepth; d++) {
			const nextFrontier = new Set<string>();

			for (const currentId of frontier) {
				const edges = this.store.listEdges(
					(e) => e.fromId === currentId || e.toId === currentId,
				);

				for (const edge of edges) {
					const neighborId = edge.fromId === currentId ? edge.toId : edge.fromId;
					if (visited.has(neighborId)) continue;

					visited.add(neighborId);
					parent.set(neighborId, { nodeId: currentId, edgeId: edge.id });
					nextFrontier.add(neighborId);

					if (neighborId === toId) {
						// Reconstruct path
						const pathEdges: Edge[] = [];
						const pathNodeIds = new Set<string>([toId]);
						let current: string | undefined = toId;

						while (current && current !== fromId) {
							const p = parent.get(current);
							if (!p) break;
							const edge = this.store.getEdge(p.edgeId);
							if (edge) pathEdges.unshift(edge);
							pathNodeIds.add(p.nodeId);
							current = p.nodeId;
						}

						const pathNodes = [...pathNodeIds]
							.map((id) => this.store.getNode(id))
							.filter((n): n is BaseNode => n !== undefined);

						return { nodes: pathNodes, edges: pathEdges };
					}
				}
			}

			frontier = nextFrontier;
		}

		return null; // No path found within maxDepth
	}

	getSubgraph(filters: {
		taskId?: string;
		focusId?: string;
		depth?: number;
	}): { nodes: BaseNode[]; edges: Edge[] } {
		if (filters.focusId) {
			const result = this.getNeighbors(filters.focusId, filters.depth ?? 2);
			const focusNode = this.store.getNode(filters.focusId);
			if (focusNode && !result.nodes.some((n) => n.id === focusNode.id)) {
				result.nodes.unshift(focusNode);
			}
			if (filters.taskId) {
				const taskNodeIds = new Set(
					this.listNodes({ taskId: filters.taskId }).map((node) => node.id),
				);
				result.nodes = result.nodes.filter((n) => taskNodeIds.has(n.id));
				const nodeIds = new Set(result.nodes.map((n) => n.id));
				result.edges = result.edges.filter(
					(e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId),
				);
			}
			return result;
		}

		if (filters.taskId) {
			const nodes = this.listNodes({ taskId: filters.taskId });
			const nodeIdSet = new Set(nodes.map((node) => node.id));
			const edges = this.store.listEdges(
				(e) => nodeIdSet.has(e.fromId) && nodeIdSet.has(e.toId),
			);
			return { nodes, edges };
		}

		return {
			nodes: this.store.listNodes(),
			edges: this.store.listEdges(),
		};
	}

	getStats(taskId?: string): {
		nodeCountByKind: Record<string, number>;
		edgeCountByType: Record<string, number>;
		totalNodes: number;
		totalEdges: number;
	} {
		const nodes = taskId ? this.listNodes({ taskId }) : this.store.listNodes();
		const nodeIds = new Set(nodes.map((n) => n.id));
		const edges = this.store.listEdges().filter((e) => {
			if (!taskId) return true;
			return nodeIds.has(e.fromId) && nodeIds.has(e.toId);
		});

		const nodeCountByKind: Record<string, number> = {};
		for (const node of nodes) {
			nodeCountByKind[node.kind] = (nodeCountByKind[node.kind] ?? 0) + 1;
		}

		const edgeCountByType: Record<string, number> = {};
		for (const edge of edges) {
			edgeCountByType[edge.type] = (edgeCountByType[edge.type] ?? 0) + 1;
		}

		return {
			nodeCountByKind,
			edgeCountByType,
			totalNodes: nodes.length,
			totalEdges: edges.length,
		};
	}

	lint(taskId?: string): {
		issues: Array<{ severity: string; message: string; nodeId?: string; edgeId?: string }>;
	} {
		const issues: Array<{
			severity: string;
			message: string;
			nodeId?: string;
			edgeId?: string;
		}> = [];

		const nodes = taskId ? this.listNodes({ taskId }) : this.store.listNodes();

		// Check for orphan nodes (no edges, not Task/Question/Gap kind — these are valid standalone)
		const standaloneKinds = new Set(["Task", "Question", "Gap", "Hypothesis", "Source"]);
		for (const node of nodes) {
			if (standaloneKinds.has(node.kind)) continue;
			const hasEdges = this.store.listEdges(
				(e) => e.fromId === node.id || e.toId === node.id,
			);
			const hasEvidenceLinks = this.store.listEvidenceLinks(
				(l) => l.targetId === node.id || l.evidenceId === node.id,
			);
			if (hasEdges.length === 0 && hasEvidenceLinks.length === 0) {
				issues.push({
					severity: "warning",
					message: `孤立节点: "${node.title ?? node.id}" (${node.kind}) 无任何边或证据链接连接`,
					nodeId: node.id,
				});
			}
		}

		// Check for broken edges (from/to nodes don't exist)
		const allEdges = this.store.listEdges();
		for (const edge of allEdges) {
			if (!this.store.getNode(edge.fromId)) {
				issues.push({
					severity: "error",
					message: `断边: 边 ${edge.id} 的源节点 ${edge.fromId} 不存在`,
					edgeId: edge.id,
				});
			}
			if (!this.store.getNode(edge.toId)) {
				issues.push({
					severity: "error",
					message: `断边: 边 ${edge.id} 的目标节点 ${edge.toId} 不存在`,
					edgeId: edge.id,
				});
			}
		}

		// Check for Claims without evidence
		for (const node of nodes) {
			if (node.kind !== "Claim") continue;
			const evidenceLinks = this.store.listEvidenceLinks(
				(l) => l.targetId === node.id && l.targetType === "node",
			);
			if (evidenceLinks.length === 0) {
				issues.push({
					severity: "warning",
					message: `断言 "${node.text ?? node.title ?? node.id}" 无证据支持`,
					nodeId: node.id,
				});
			}
			// Check for shallow claims (text too short)
			const text = node.text ?? "";
			if (text.length < 50) {
				issues.push({
					severity: "warning",
					message: `断言 "${text.substring(0, 30)}..." 过短（${text.length}字），应≥50字，包含完整知识（机制+条件+证据）`,
					nodeId: node.id,
				});
			}
		}

		// Check for Evidence text length
		for (const node of nodes) {
			if (node.kind !== "Evidence") continue;
			const text = node.text ?? "";
			if (text.length < 20) {
				issues.push({
					severity: "warning",
					message: `证据 "${text.substring(0, 20)}..." 过短（${text.length}字），应≥20字，直接引用原文`,
					nodeId: node.id,
				});
			}
		}

		// Check for long-standing open Questions
		for (const node of nodes) {
			if (node.kind !== "Question" || node.status !== "open") continue;
			const createdAt = new Date(node.createdAt);
			const daysSinceCreation =
				(Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
			if (daysSinceCreation > 7) {
				issues.push({
					severity: "info",
					message: `问题 "${node.text ?? node.title ?? node.id}" 已保持 open 状态超过 ${Math.floor(daysSinceCreation)} 天`,
					nodeId: node.id,
				});
			}
		}

		return { issues };
	}
}

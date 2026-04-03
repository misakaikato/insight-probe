import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): { store: GraphStore; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	return { store, cleanup: () => rmSync(dir, { recursive: true }) };
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

describe("GraphService", () => {
	it("should create a new node via upsertNode", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const node = service.upsertNode({
			kind: "Entity",
			type: "Person",
			title: "OpenAI",
			attrs: { aliases: ["OpenAI Inc."] },
		});
		expect(node.id).toMatch(/^ent_/);
		expect(node.kind).toBe("Entity");
		expect(node.title).toBe("OpenAI");
	});

	it("should update an existing node via upsertNode", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const created = service.upsertNode({
			kind: "Entity",
			type: "Person",
			title: "OpenAI",
			attrs: {},
		});
		const updated = service.upsertNode({
			id: created.id,
			kind: "Entity",
			type: "Organization",
			title: "OpenAI Inc.",
			attrs: {},
		});
		expect(updated.id).toBe(created.id);
		expect(updated.title).toBe("OpenAI Inc.");
	});

	it("should list nodes filtered by kind", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		service.upsertNode({ kind: "Entity", type: "Person", title: "E1", attrs: {} });
		service.upsertNode({ kind: "Entity", type: "Organization", title: "E2", attrs: {} });
		service.upsertNode({ kind: "Claim", text: "C1", status: "proposed", attrs: {} });

		const entities = service.listNodes({ kind: "Entity" });
		expect(entities).toHaveLength(2);
	});

	it("should list nodes filtered by status", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		service.upsertNode({ kind: "Claim", text: "C1", status: "supported", attrs: {} });
		service.upsertNode({ kind: "Claim", text: "C2", status: "proposed", attrs: {} });

		const supported = service.listNodes({ status: "supported" });
		expect(supported).toHaveLength(1);
	});

	it("should delete a node and cascade delete edges", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const n1 = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const n2 = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		const edge = service.createEdge({ type: "related_to", fromId: n1.id, toId: n2.id });

		service.deleteNode(n1.id);
		expect(context.store.getNode(n1.id)).toBeUndefined();
		expect(context.store.getEdge(edge.id)).toBeUndefined();
	});

	it("should create an edge and verify nodes exist", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const n1 = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const n2 = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });

		const edge = service.createEdge({ type: "related_to", fromId: n1.id, toId: n2.id });
		expect(edge.id).toMatch(/^e_/);
		expect(edge.fromId).toBe(n1.id);
	});

	it("should throw when creating edge with non-existent nodes", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		expect(() =>
			service.createEdge({ type: "related_to", fromId: "nonexistent", toId: "also_nonexistent" }),
		).toThrow();
	});

	it("should list edges filtered by fromId", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const n1 = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const n2 = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		const n3 = service.upsertNode({ kind: "Entity", type: "Person", title: "C", attrs: {} });
		service.createEdge({ type: "related_to", fromId: n1.id, toId: n2.id });
		service.createEdge({ type: "mentioned_in", fromId: n1.id, toId: n3.id });
		service.createEdge({ type: "related_to", fromId: n2.id, toId: n3.id });

		const fromN1 = service.listEdges({ fromId: n1.id });
		expect(fromN1).toHaveLength(2);
	});

	it("should list edges filtered by toId", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const n1 = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const n2 = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		const n3 = service.upsertNode({ kind: "Entity", type: "Person", title: "C", attrs: {} });
		service.createEdge({ type: "related_to", fromId: n1.id, toId: n2.id });
		service.createEdge({ type: "related_to", fromId: n3.id, toId: n2.id });

		const toN2 = service.listEdges({ toId: n2.id });
		expect(toN2).toHaveLength(2);
	});

	it("should list edges filtered by type", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const n1 = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const n2 = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		service.createEdge({ type: "related_to", fromId: n1.id, toId: n2.id });
		service.createEdge({ type: "mentioned_in", fromId: n1.id, toId: n2.id });

		const related = service.listEdges({ type: "related_to" });
		expect(related).toHaveLength(1);
	});

	it("should get neighbors via BFS traversal", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const a = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const b = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		const c = service.upsertNode({ kind: "Entity", type: "Person", title: "C", attrs: {} });
		service.createEdge({ type: "related_to", fromId: a.id, toId: b.id });
		service.createEdge({ type: "related_to", fromId: b.id, toId: c.id });

		const result = service.getNeighbors(a.id, 2);
		// getNeighbors returns { nodes, edges } not a flat array
		expect(result.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([b.id, c.id]));
	});

	it("should get a subgraph", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		const a = service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		const b = service.upsertNode({ kind: "Entity", type: "Person", title: "B", attrs: {} });
		const c = service.upsertNode({ kind: "Entity", type: "Person", title: "C", attrs: {} });
		service.createEdge({ type: "related_to", fromId: a.id, toId: b.id });
		service.createEdge({ type: "related_to", fromId: b.id, toId: c.id });

		// getSubgraph takes { focusId, depth, taskId } object
		const subgraph = service.getSubgraph({ focusId: a.id, depth: 2 });
		expect(subgraph.nodes.length).toBeGreaterThanOrEqual(2);
	});

	it("should return stats", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		service.upsertNode({ kind: "Entity", type: "Person", title: "A", attrs: {} });
		service.upsertNode({ kind: "Claim", text: "C1", status: "proposed", attrs: {} });

		const stats = service.getStats();
		expect(stats.totalNodes).toBeGreaterThanOrEqual(2);
		// Field is nodeCountByKind, not nodesByKind
		expect(stats.nodeCountByKind.Entity).toBeGreaterThanOrEqual(1);
	});

	it("should detect orphan nodes via lint", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		service.upsertNode({ kind: "Entity", type: "Person", title: "Orphan", attrs: {} });

		const result = service.lint();
		// lint returns { issues: [...] }, not { orphanNodes }
		const orphanIssues = result.issues.filter(
			(i) => i.severity === "warning" && i.message.includes("孤立节点"),
		);
		expect(orphanIssues.length).toBeGreaterThanOrEqual(1);
	});

	it("should detect broken edges via lint", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		// Manually create an edge pointing to non-existent node
		context.store.createEdge({
			id: "e_broken",
			type: "related_to",
			fromId: "ent_fake1",
			toId: "ent_fake2",
			directed: true,
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const result = service.lint();
		// lint returns { issues: [...] }, not { brokenEdges }
		const brokenEdgeIssues = result.issues.filter(
			(i) => i.severity === "error" && i.message.includes("断边"),
		);
		expect(brokenEdgeIssues.length).toBeGreaterThanOrEqual(1);
	});

	it("should detect claims without evidence via lint", () => {
		context = createTestStore();
		const service = new GraphService(context.store);
		service.upsertNode({ kind: "Claim", text: "Unevidenced claim", status: "proposed", attrs: {} });

		const result = service.lint();
		// lint returns { issues: [...] }, not { claimsWithoutEvidence }
		const unevidencedClaimIssues = result.issues.filter(
			(i) => i.severity === "warning" && i.message.includes("无证据支持"),
		);
		expect(unevidencedClaimIssues.length).toBeGreaterThanOrEqual(1);
	});
});

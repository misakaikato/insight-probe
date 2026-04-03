import { describe, it, expect, afterEach } from "vitest";
import { GraphStore, emptyGraphData } from "../../../src/storage/graph-store";
import type { BaseNode, Edge, EvidenceLink, Task, OpLog } from "../../../src/core/models/types";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): { store: GraphStore; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	return { store, cleanup: () => rmSync(dir, { recursive: true }) };
}

function makeNode(overrides: Partial<BaseNode> = {}): BaseNode {
	const now = new Date().toISOString();
	return {
		id: "ent_test1",
		kind: "Entity",
		type: "Person",
		title: "Test Entity",
		attrs: {},
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
	const now = new Date().toISOString();
	return {
		id: "e_test1",
		type: "related_to",
		fromId: "ent_test1",
		toId: "ent_test2",
		directed: true,
		attrs: {},
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

// ── Nodes ──

describe("GraphStore - Nodes", () => {
	it("should upsert and get a node", () => {
		context = createTestStore();
		const node = makeNode();
		context.store.upsertNode(node);
		const got = context.store.getNode(node.id);
		expect(got).toEqual(node);
	});

	it("should update an existing node via upsert", () => {
		context = createTestStore();
		const node = makeNode();
		context.store.upsertNode(node);

		const updated = { ...node, title: "Updated Title", updatedAt: new Date().toISOString() };
		context.store.upsertNode(updated);

		const got = context.store.getNode(node.id);
		expect(got?.title).toBe("Updated Title");
	});

	it("should return undefined for non-existent node", () => {
		context = createTestStore();
		const got = context.store.getNode("nonexistent");
		expect(got).toBeUndefined();
	});

	it("should list all nodes", () => {
		context = createTestStore();
		const node1 = makeNode({ id: "ent_1", title: "Node 1" });
		const node2 = makeNode({ id: "ent_2", title: "Node 2", kind: "Claim", text: "A claim" });
		context.store.upsertNode(node1);
		context.store.upsertNode(node2);

		const all = context.store.listNodes();
		expect(all).toHaveLength(2);
	});

	it("should list nodes with predicate filter", () => {
		context = createTestStore();
		const entity = makeNode({ id: "ent_1", kind: "Entity" });
		const claim = makeNode({ id: "clm_1", kind: "Claim", text: "A claim" });
		context.store.upsertNode(entity);
		context.store.upsertNode(claim);

		const entities = context.store.listNodes((n) => n.kind === "Entity");
		expect(entities).toHaveLength(1);
		expect(entities[0].id).toBe("ent_1");
	});

	it("should count nodes", () => {
		context = createTestStore();
		context.store.upsertNode(makeNode({ id: "ent_1" }));
		context.store.upsertNode(makeNode({ id: "ent_2" }));
		expect(context.store.countNodes()).toBe(2);
		expect(context.store.countNodes((n) => n.kind === "Entity")).toBe(2);
	});

	it("should delete a node", () => {
		context = createTestStore();
		const node = makeNode();
		context.store.upsertNode(node);
		expect(context.store.deleteNode(node.id)).toBe(true);
		expect(context.store.getNode(node.id)).toBeUndefined();
	});

	it("should return false when deleting non-existent node", () => {
		context = createTestStore();
		expect(context.store.deleteNode("nonexistent")).toBe(false);
	});

	it("should cascade delete related edges when deleting a node", () => {
		context = createTestStore();
		const node1 = makeNode({ id: "ent_1" });
		const node2 = makeNode({ id: "ent_2" });
		const edge = makeEdge({ id: "e_1", fromId: "ent_1", toId: "ent_2" });
		context.store.upsertNode(node1);
		context.store.upsertNode(node2);
		context.store.createEdge(edge);

		context.store.deleteNode("ent_1");
		expect(context.store.getEdge("e_1")).toBeUndefined();
	});

	it("should cascade delete related evidence links when deleting a node", () => {
		context = createTestStore();
		const evidence = makeNode({ id: "ev_1", kind: "Evidence", text: "evidence text" });
		const target = makeNode({ id: "clm_1", kind: "Claim", text: "claim text" });
		const link: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			createdAt: new Date().toISOString(),
		};
		context.store.upsertNode(evidence);
		context.store.upsertNode(target);
		context.store.createEvidenceLink(link);

		context.store.deleteNode("ev_1");
		expect(context.store.getEvidenceLink("evl_1")).toBeUndefined();
	});

	it("should cascade delete node-task links when deleting a node", () => {
		context = createTestStore();
		const node = makeNode({ id: "ent_1" });
		context.store.upsertNode(node);

		const task: Task = {
			id: "task_1",
			title: "Test Task",
			goal: "Test",
			status: "active",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		context.store.createTask(task);
		context.store.linkNodeToTask("ent_1", "task_1", "ntl_1");
		expect(context.store.getNodeTaskIds("ent_1")).toContain("task_1");

		context.store.deleteNode("ent_1");
		expect(context.store.getNodeTaskIds("ent_1")).toHaveLength(0);
	});
});

// ── Edges ──

describe("GraphStore - Edges", () => {
	it("should create and get an edge", () => {
		context = createTestStore();
		const edge = makeEdge();
		context.store.createEdge(edge);
		const got = context.store.getEdge(edge.id);
		expect(got).toEqual(edge);
	});

	it("should list all edges", () => {
		context = createTestStore();
		context.store.createEdge(makeEdge({ id: "e_1", fromId: "a", toId: "b" }));
		context.store.createEdge(makeEdge({ id: "e_2", fromId: "c", toId: "d" }));
		expect(context.store.listEdges()).toHaveLength(2);
	});

	it("should list edges with predicate filter", () => {
		context = createTestStore();
		context.store.createEdge(makeEdge({ id: "e_1", type: "related_to", fromId: "a", toId: "b" }));
		context.store.createEdge(makeEdge({ id: "e_2", type: "mentioned_in", fromId: "c", toId: "d" }));

		const related = context.store.listEdges((e) => e.type === "related_to");
		expect(related).toHaveLength(1);
		expect(related[0].id).toBe("e_1");
	});

	it("should delete an edge", () => {
		context = createTestStore();
		const edge = makeEdge();
		context.store.createEdge(edge);
		expect(context.store.deleteEdge(edge.id)).toBe(true);
		expect(context.store.getEdge(edge.id)).toBeUndefined();
	});

	it("should return false when deleting non-existent edge", () => {
		context = createTestStore();
		expect(context.store.deleteEdge("nonexistent")).toBe(false);
	});

	it("should cascade delete evidence links when deleting an edge", () => {
		context = createTestStore();
		const edge = makeEdge({ id: "e_1" });
		const link: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "edge",
			targetId: "e_1",
			role: "supports",
			createdAt: new Date().toISOString(),
		};
		context.store.createEdge(edge);
		context.store.createEvidenceLink(link);

		context.store.deleteEdge("e_1");
		expect(context.store.getEvidenceLink("evl_1")).toBeUndefined();
	});
});

// ── Evidence Links ──

describe("GraphStore - Evidence Links", () => {
	it("should create and get an evidence link", () => {
		context = createTestStore();
		const link: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			confidence: 0.9,
			createdAt: new Date().toISOString(),
		};
		context.store.createEvidenceLink(link);
		const got = context.store.getEvidenceLink(link.id);
		expect(got).toEqual(link);
	});

	it("should list all evidence links", () => {
		context = createTestStore();
		const link1: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			createdAt: new Date().toISOString(),
		};
		const link2: EvidenceLink = {
			id: "evl_2",
			evidenceId: "ev_2",
			targetType: "edge",
			targetId: "e_1",
			role: "contradicts",
			createdAt: new Date().toISOString(),
		};
		context.store.createEvidenceLink(link1);
		context.store.createEvidenceLink(link2);
		expect(context.store.listEvidenceLinks()).toHaveLength(2);
	});

	it("should filter evidence links by predicate", () => {
		context = createTestStore();
		const link1: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			createdAt: new Date().toISOString(),
		};
		const link2: EvidenceLink = {
			id: "evl_2",
			evidenceId: "ev_2",
			targetType: "node",
			targetId: "clm_2",
			role: "contradicts",
			createdAt: new Date().toISOString(),
		};
		context.store.createEvidenceLink(link1);
		context.store.createEvidenceLink(link2);

		const supports = context.store.listEvidenceLinks((l) => l.role === "supports");
		expect(supports).toHaveLength(1);
		expect(supports[0].id).toBe("evl_1");
	});

	it("should delete an evidence link", () => {
		context = createTestStore();
		const link: EvidenceLink = {
			id: "evl_1",
			evidenceId: "ev_1",
			targetType: "node",
			targetId: "clm_1",
			role: "supports",
			createdAt: new Date().toISOString(),
		};
		context.store.createEvidenceLink(link);
		expect(context.store.deleteEvidenceLink(link.id)).toBe(true);
		expect(context.store.getEvidenceLink(link.id)).toBeUndefined();
	});

	it("should return false when deleting non-existent evidence link", () => {
		context = createTestStore();
		expect(context.store.deleteEvidenceLink("nonexistent")).toBe(false);
	});
});

// ── Tasks ──

describe("GraphStore - Tasks", () => {
	it("should create and get a task", () => {
		context = createTestStore();
		const task: Task = {
			id: "task_1",
			title: "Test Task",
			goal: "Research something",
			status: "active",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		context.store.createTask(task);
		const got = context.store.getTask(task.id);
		expect(got).toEqual(task);
	});

	it("should update a task", () => {
		context = createTestStore();
		const task: Task = {
			id: "task_1",
			title: "Test Task",
			goal: "Research",
			status: "active",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		context.store.createTask(task);
		const updated = context.store.updateTask("task_1", { status: "completed" });
		expect(updated?.status).toBe("completed");
		expect(context.store.getTask("task_1")?.status).toBe("completed");
	});

	it("should return undefined when updating non-existent task", () => {
		context = createTestStore();
		const result = context.store.updateTask("nonexistent", { status: "completed" });
		expect(result).toBeUndefined();
	});

	it("should list all tasks", () => {
		context = createTestStore();
		const task1: Task = {
			id: "task_1",
			title: "Task 1",
			goal: "Goal 1",
			status: "active",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const task2: Task = {
			id: "task_2",
			title: "Task 2",
			goal: "Goal 2",
			status: "paused",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		context.store.createTask(task1);
		context.store.createTask(task2);
		expect(context.store.listTasks()).toHaveLength(2);
	});

	it("should list tasks with predicate filter", () => {
		context = createTestStore();
		const task1: Task = {
			id: "task_1",
			title: "Task 1",
			goal: "Goal 1",
			status: "active",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const task2: Task = {
			id: "task_2",
			title: "Task 2",
			goal: "Goal 2",
			status: "paused",
			attrs: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		context.store.createTask(task1);
		context.store.createTask(task2);
		const active = context.store.listTasks((t) => t.status === "active");
		expect(active).toHaveLength(1);
	});
});

// ── Node-Task Links ──

describe("GraphStore - NodeTaskLinks", () => {
	it("should link a node to a task and retrieve task ids", () => {
		context = createTestStore();
		context.store.linkNodeToTask("ent_1", "task_1", "ntl_1");
		expect(context.store.getNodeTaskIds("ent_1")).toContain("task_1");
	});

	it("should retrieve node ids from a task", () => {
		context = createTestStore();
		context.store.linkNodeToTask("ent_1", "task_1", "ntl_1");
		context.store.linkNodeToTask("ent_2", "task_1", "ntl_2");
		expect(context.store.getTaskNodeIds("task_1")).toEqual(
			expect.arrayContaining(["ent_1", "ent_2"]),
		);
	});

	it("should unlink a node from a task", () => {
		context = createTestStore();
		context.store.linkNodeToTask("ent_1", "task_1", "ntl_1");
		context.store.unlinkNodeFromTask("ent_1", "task_1");
		expect(context.store.getNodeTaskIds("ent_1")).toHaveLength(0);
	});
});

// ── Op Logs ──

describe("GraphStore - OpLogs", () => {
	it("should add and list op logs", () => {
		context = createTestStore();
		const log: OpLog = {
			id: "op_1",
			opType: "upsertNode",
			actor: "human",
			payload: { nodeId: "ent_1" },
			createdAt: new Date().toISOString(),
		};
		context.store.addOpLog(log);
		const logs = context.store.listOpLogs();
		expect(logs).toHaveLength(1);
		expect(logs[0]).toEqual(log);
	});

	it("should list op logs newest first", () => {
		context = createTestStore();
		const log1: OpLog = {
			id: "op_1",
			opType: "upsertNode",
			actor: "human",
			payload: {},
			createdAt: "2026-01-01T00:00:00Z",
		};
		const log2: OpLog = {
			id: "op_2",
			opType: "createEdge",
			actor: "llm",
			payload: {},
			createdAt: "2026-01-02T00:00:00Z",
		};
		context.store.addOpLog(log1);
		context.store.addOpLog(log2);
		const logs = context.store.listOpLogs();
		expect(logs[0].id).toBe("op_2");
		expect(logs[1].id).toBe("op_1");
	});

	it("should filter op logs by predicate", () => {
		context = createTestStore();
		const log1: OpLog = {
			id: "op_1",
			opType: "upsertNode",
			actor: "human",
			payload: {},
			createdAt: new Date().toISOString(),
		};
		const log2: OpLog = {
			id: "op_2",
			opType: "createEdge",
			actor: "llm",
			payload: {},
			createdAt: new Date().toISOString(),
		};
		context.store.addOpLog(log1);
		context.store.addOpLog(log2);
		const llmLogs = context.store.listOpLogs((l) => l.actor === "llm");
		expect(llmLogs).toHaveLength(1);
		expect(llmLogs[0].id).toBe("op_2");
	});
});

// ── Persistence ──

describe("GraphStore - Save/Load", () => {
	it("should persist data to disk on save", () => {
		context = createTestStore();
		const node = makeNode();
		context.store.upsertNode(node);
		context.store.save();

		expect(existsSync(context.store.path)).toBe(true);
		const raw = readFileSync(context.store.path, "utf-8");
		const data = JSON.parse(raw);
		expect(data.nodes[node.id]).toEqual(node);
	});

	it("should load existing data from disk", () => {
		context = createTestStore();
		const node = makeNode();
		context.store.upsertNode(node);
		context.store.save();

		const dir = context.store.path.replace("/kg.json", "");
		const store2 = new GraphStore(dir);
		const got = store2.getNode(node.id);
		expect(got).toEqual(node);
	});

	it("should start with empty graph data when file does not exist", () => {
		context = createTestStore();
		const data = context.store.raw;
		expect(data.nodes).toEqual({});
		expect(data.edges).toEqual({});
		expect(data.evidenceLinks).toEqual({});
		expect(data.tasks).toEqual({});
		expect(data.nodeTaskLinks).toEqual([]);
		expect(data.opLogs).toEqual([]);
	});

	it("should not write to disk when clean", () => {
		context = createTestStore();
		// Creating the store marks dirty, save once
		context.store.save();

		// Read modification time
		const stat1 = readFileSync(context.store.path, "utf-8");

		// Save again without changes - should be no-op
		context.store.save();
		const stat2 = readFileSync(context.store.path, "utf-8");
		expect(stat1).toBe(stat2);
	});
});

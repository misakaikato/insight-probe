import { z } from "zod";
import type { BaseNode, Edge, EvidenceLink } from "../models/types";

// ── Node Kind ──

export const NodeKindSchema = z.enum([
	"Entity",
	"Claim",
	"Source",
	"Evidence",
	"Observation",
	"Question",
	"Hypothesis",
	"Gap",
	"Task",
	"Value",
]);

// ── Base Node ──

export const BaseNodeSchema = z.object({
	id: z.string(),
	kind: NodeKindSchema,
	type: z.string().optional(),
	title: z.string().optional(),
	text: z.string().optional(),
	summary: z.string().optional(),
	status: z.string().optional(),
	confidence: z.number().min(0).max(1).optional(),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Entity ──

export const EntitySchema = BaseNodeSchema.extend({
	kind: z.literal("Entity"),
	type: z.string(),
	title: z.string(),
});

// ── Claim ──

export const ClaimStatusSchema = z.enum([
	"proposed",
	"supported",
	"weakly_supported",
	"contested",
	"contradicted",
	"deprecated",
	"superseded",
]);

export const ClaimSchema = BaseNodeSchema.extend({
	kind: z.literal("Claim"),
	text: z.string(),
	status: ClaimStatusSchema,
});

// ── Source ──

export const SourceSchema = BaseNodeSchema.extend({
	kind: z.literal("Source"),
	type: z.enum(["webpage", "pdf", "forum", "repo", "dataset", "note", "other"]),
	title: z.string(),
});

// ── Evidence ──

export const EvidenceSchema = BaseNodeSchema.extend({
	kind: z.literal("Evidence"),
	text: z.string(),
});

// ── Question ──

export const QuestionStatusSchema = z.enum(["open", "in_progress", "resolved", "blocked", "obsolete"]);

export const QuestionSchema = BaseNodeSchema.extend({
	kind: z.literal("Question"),
	text: z.string(),
	status: QuestionStatusSchema,
});

// ── Hypothesis ──

export const HypothesisSchema = BaseNodeSchema.extend({
	kind: z.literal("Hypothesis"),
	text: z.string(),
	status: z.string().default("proposed"),
	confidence: z.number().min(0).max(1).optional(),
});

// ── Gap ──

export const GapSchema = BaseNodeSchema.extend({
	kind: z.literal("Gap"),
	text: z.string(),
	status: z.string().default("open"),
});

// ── Observation ──

export const ObservationSchema = BaseNodeSchema.extend({
	kind: z.literal("Observation"),
	text: z.string(),
	status: z.string().default("unresolved"),
});

// ── Task ──

export const TaskSchema = z.object({
	id: z.string(),
	title: z.string(),
	goal: z.string(),
	status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Edge ──

export const EdgeSchema = z.object({
	id: z.string(),
	type: z.string(),
	fromId: z.string(),
	toId: z.string(),
	directed: z.boolean().default(true),
	confidence: z.number().min(0).max(1).optional(),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Evidence Link ──

export const EvidenceLinkSchema = z.object({
	id: z.string(),
	evidenceId: z.string(),
	targetType: z.enum(["node", "edge"]),
	targetId: z.string(),
	role: z.enum(["supports", "contradicts", "mentions", "qualifies"]),
	confidence: z.number().min(0).max(1).optional(),
	createdAt: z.string(),
});

// ── Op Log ──

export const OpLogSchema = z.object({
	id: z.string(),
	opType: z.string(),
	actor: z.enum(["human", "llm", "agent"]),
	taskId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
});

// ── Schema map by kind ──

export const SchemaByKind: Record<string, z.ZodTypeAny> = {
	Entity: EntitySchema,
	Claim: ClaimSchema,
	Source: SourceSchema,
	Evidence: EvidenceSchema,
	Observation: ObservationSchema,
	Question: QuestionSchema,
	Hypothesis: HypothesisSchema,
	Gap: GapSchema,
	Task: BaseNodeSchema.extend({ kind: z.literal("Task") }),
	Value: BaseNodeSchema.extend({ kind: z.literal("Value") }),
};

function formatSchemaErrors(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "root";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

export function validateNode(node: BaseNode): BaseNode {
	const schema = SchemaByKind[node.kind];
	if (!schema) {
		throw new Error(`Unsupported node kind: ${node.kind}`);
	}

	const result = schema.safeParse(node);
	if (!result.success) {
		throw new Error(`Invalid ${node.kind} node: ${formatSchemaErrors(result.error)}`);
	}

	return result.data as BaseNode;
}

export function validateEdge(edge: Edge): Edge {
	const result = EdgeSchema.safeParse(edge);
	if (!result.success) {
		throw new Error(`Invalid edge: ${formatSchemaErrors(result.error)}`);
	}

	return result.data;
}

export function validateEvidenceLink(link: EvidenceLink): EvidenceLink {
	const result = EvidenceLinkSchema.safeParse(link);
	if (!result.success) {
		throw new Error(`Invalid evidence link: ${formatSchemaErrors(result.error)}`);
	}

	return result.data;
}

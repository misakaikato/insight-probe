// ── Node kinds ──

export type NodeKind =
	| "Entity"
	| "Claim"
	| "Source"
	| "Evidence"
	| "Observation"
	| "Question"
	| "Hypothesis"
	| "Gap"
	| "Task"
	| "Value";

// ── Claim status ──

export type ClaimStatus =
	| "proposed"
	| "supported"
	| "weakly_supported"
	| "contested"
	| "contradicted"
	| "deprecated"
	| "superseded";

// ── Question status ──

export type QuestionStatus = "open" | "in_progress" | "resolved" | "blocked" | "obsolete";

// ── Source type ──

export type SourceType = "webpage" | "pdf" | "forum" | "repo" | "dataset" | "note" | "other";

// ── Evidence link role ──

export type EvidenceLinkRole = "supports" | "contradicts" | "mentions" | "qualifies";

// ── Task status ──

export type TaskStatus = "active" | "paused" | "completed" | "archived";

// ── Base Node ──

export interface BaseNode {
	id: string;
	kind: NodeKind;
	type?: string;
	title?: string;
	text?: string;
	summary?: string;
	status?: string;
	confidence?: number;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ── Edge ──

export interface Edge {
	id: string;
	type: string;
	fromId: string;
	toId: string;
	directed: boolean;
	confidence?: number;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ── Evidence Link ──

export type EvidenceLinkTargetType = "node" | "edge";

export interface EvidenceLink {
	id: string;
	evidenceId: string;
	targetType: EvidenceLinkTargetType;
	targetId: string;
	role: EvidenceLinkRole;
	confidence?: number;
	createdAt: string;
}

// ── Task ──

export interface Task {
	id: string;
	title: string;
	goal: string;
	status: TaskStatus;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ── Node-Task Link ──

export interface NodeTaskLink {
	id: string;
	nodeId: string;
	taskId: string;
	createdAt: string;
}

// ── Op Log ──

export interface OpLog {
	id: string;
	opType: string;
	actor: "human" | "llm" | "agent";
	taskId?: string;
	payload: Record<string, unknown>;
	createdAt: string;
}

// ── LLM Task Envelope ──

export interface LlmTaskEnvelope {
	taskType: string;
	taskId?: string;
	graphContext: {
		focusNodeIds?: string[];
		relatedNodes: BaseNode[];
		relatedEdges: Edge[];
		relatedEvidence: BaseNode[];
	};
	inputContext: Record<string, unknown>;
	instructions: string;
	recommendedPrompt: string;
	outputSchema: Record<string, unknown>;
	executionHint?: {
		suggestedCommand: string;
		dryRunCommand?: string;
	};
}

// ── Prompt Template Context ──

export interface PromptTemplateContext {
	task: Task | null;
	source?: BaseNode;
	focusNodes?: BaseNode[];
	relatedClaims?: BaseNode[];
	relatedEvidence?: BaseNode[];
	openQuestions?: BaseNode[];
	knownSchema?: {
		entityTypes: string[];
		claimTypes: string[];
		predicates: string[];
	};
}

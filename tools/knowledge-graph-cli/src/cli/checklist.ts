import type { BaseNode, Edge, EvidenceLinkTargetType } from "../core/models/types";
import type { Services } from "./types";

function dedupeTaskIds(taskIds: string[]): string[] {
	return [...new Set(taskIds.filter((taskId) => taskId.trim().length > 0))];
}

export function markTaskWorkflow(
	services: Services,
	taskId: string | undefined,
	workflowTexts: string[],
): void {
	if (!taskId) return;
	for (const workflowText of workflowTexts) {
		services.taskChecklist.markWorkflowProgressForTasks([taskId], workflowText);
	}
}

export function markNodeWorkflow(
	services: Services,
	node: BaseNode,
	workflowTexts: string[],
): void {
	const taskIds = dedupeTaskIds(services.taskChecklist.getTaskIdsForNode(node));
	if (taskIds.length === 0) return;
	for (const workflowText of workflowTexts) {
		services.taskChecklist.markWorkflowProgressForTasks(taskIds, workflowText);
	}
}

export function markEdgeWorkflow(
	services: Services,
	edge: Edge,
	workflowTexts: string[],
): void {
	const taskIds = dedupeTaskIds(
		services.taskChecklist.getTaskIdsForEdgeNodes(edge.fromId, edge.toId),
	);
	if (taskIds.length === 0) return;
	for (const workflowText of workflowTexts) {
		services.taskChecklist.markWorkflowProgressForTasks(taskIds, workflowText);
	}
}

export function markEvidenceLinkWorkflow(
	services: Services,
	evidenceId: string,
	targetType: EvidenceLinkTargetType,
	targetId: string,
	workflowTexts: string[],
): void {
	const taskIds = dedupeTaskIds(
		services.taskChecklist.getTaskIdsForEvidenceLink(evidenceId, targetType, targetId),
	);
	if (taskIds.length === 0) return;
	for (const workflowText of workflowTexts) {
		services.taskChecklist.markWorkflowProgressForTasks(taskIds, workflowText);
	}
}

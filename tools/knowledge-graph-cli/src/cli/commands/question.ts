import type { Command } from "commander";
import type { QuestionStatus } from "../../core/models/types";
import { getContext } from "../context";
import { markNodeWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerQuestionCommand(program: Command): void {
	const cmd = program.command("question").description("Manage question nodes");

	cmd
		.command("add")
		.description("Add a new question")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.option("--task <taskId>", "Link the question to a task")
		.action(async (opts: { jsonIn?: string; task?: string }) => {
			try {
				const { services } = getContext();
				let data: {
					text: string;
					questionType?: string;
					priority?: number;
					status?: QuestionStatus;
					attrs?: Record<string, unknown>;
					taskId?: string;
				};
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				if (opts.task) {
					data.taskId = opts.task;
				}
				const question = services.question.addQuestion(data);
				markNodeWorkflow(services, question, [WORKFLOW_ITEMS.synthesizeNextRound]);
				writeJson(question);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get a question by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const question = services.question.getQuestion(id);
				if (!question) writeError("Not found");
				writeJson(question);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List questions with optional filters")
		.option("--status <status>", "Filter by status")
		.option("--task <taskId>", "Filter by task ID")
		.action((opts: { status?: string; task?: string }) => {
			try {
				const { services } = getContext();
				const filters: { status?: string; taskId?: string } = {};
				if (opts.status) filters.status = opts.status;
				if (opts.task) filters.taskId = opts.task;
				const questions = services.question.listQuestions(filters);
				writeJson(questions);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}

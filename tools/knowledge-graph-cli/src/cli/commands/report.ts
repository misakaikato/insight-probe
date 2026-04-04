import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerReportCommand(program: Command): void {
	const cmd = program.command("report").description("Report generation from graph");

	cmd
		.command("generate")
		.description("Generate a markdown report with citations from graph data")
		.option("--task <taskId>", "Limit to a specific task")
		.option("--title <title>", "Report title")
		.option("--format <format>", "Output format: markdown (default) or json", "markdown")
		.option("--output <file>", "Output file path (default: stdout)")
		.action(
			(opts: {
				task?: string;
				title?: string;
				format: string;
				output?: string;
			}) => {
				try {
					const { services } = getContext();
					const reportService = services.report;

					if (opts.format === "json") {
						const report = reportService.generateReport(opts.task, opts.title);
						if (opts.output) {
							writeFileSync(opts.output, JSON.stringify(report, null, 2));
						} else {
							writeJson(report);
						}
					} else {
						const markdown = reportService.generateMarkdown(opts.task, opts.title);
						if (opts.output) {
							writeFileSync(opts.output, markdown, "utf-8");
						} else {
							console.log(markdown);
						}
					}
				} catch (e) {
					writeError((e as Error).message);
				}
			},
		);

	cmd
		.command("citations")
		.description("List all citations in the graph")
		.option("--task <taskId>", "Limit to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const { citations } = services.report.buildCitationMap(opts.task);
				writeJson({ citations });
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}

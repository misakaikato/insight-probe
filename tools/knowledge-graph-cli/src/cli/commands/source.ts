import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson, parseJsonFile, parseJsonStdin } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerSourceCommand(program: Command): void {
	const cmd = program.command("source").description("Manage evidence sources");

	cmd
		.command("add")
		.description("Add a new source")
		.option("--json-in <file>", "JSON file path (use - for stdin)")
		.action(async (opts: { jsonIn?: string }) => {
			try {
				const { services } = getContext();
				let data: { title: string; uri?: string; sourceType: string; attrs?: Record<string, unknown> };
				if (opts.jsonIn && opts.jsonIn !== "-") {
					data = parseJsonFile<typeof data>(opts.jsonIn);
				} else {
					data = await parseJsonStdin<typeof data>();
				}
				const source = services.evidence.addSource(data);
				writeJson(source);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get a source by ID")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const source = services.evidence.getSource(id);
				if (!source) writeError("Not found");
				writeJson(source);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}

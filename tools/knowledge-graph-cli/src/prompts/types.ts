import type { PromptTemplateContext } from "../core/models/types";

export interface PromptBuilder {
	buildPrompt(ctx: PromptTemplateContext): string;
	outputSchema(): Record<string, unknown>;
}

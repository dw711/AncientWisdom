import "server-only";
import type { AdviceRequest, DecisionProfile } from "@/lib/contracts/advice";
import type { LlmClient } from "@/lib/server/providers/llm";
import type { Deadline } from "@/lib/server/pipeline/runtime";
import { WRITER_SYSTEM, repairPrompt, writerPrompt, type WriterCaseInput } from "./prompts";
import { WriterOutputSchema, type WriterOutput } from "./schema";

export interface Writer {
  write(): Promise<{ draft: WriterOutput; model: string }>;
  repair(previous: WriterOutput, errors: string[]): Promise<WriterOutput>;
}

export function createWriter(args: {
  llm: LlmClient;
  req: AdviceRequest;
  profile: DecisionProfile;
  cases: WriterCaseInput[];
  challengeNote: string | null;
  deadline: Deadline;
  timeoutMs: number;
  effort: "low" | "medium" | "high";
}): Writer {
  const prompt = writerPrompt({ req: args.req, profile: args.profile, cases: args.cases, challengeNote: args.challengeNote });
  const call = async (content: string) =>
    args.llm.generate({
      system: WRITER_SYSTEM,
      prompt: content,
      schema: WriterOutputSchema,
      schemaName: "historical_comparison",
      effort: args.effort,
      maxTokens: 16000,
      signal: args.deadline.signal,
      timeoutMs: Math.min(args.timeoutMs, args.deadline.remainingMs()),
    });
  return {
    async write() {
      const result = await call(prompt);
      return { draft: result.data, model: result.model };
    },
    async repair(previous, errors) {
      const result = await call(repairPrompt(prompt, previous, errors));
      return result.data;
    },
  };
}

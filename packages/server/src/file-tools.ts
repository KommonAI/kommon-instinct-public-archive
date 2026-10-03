/**
 * Pi's coding-agent file tools, bound to the owner's workspace directory and
 * tagged with capabilities so the policy engine can gate them. Only the owner
 * tier has files.read / files.write by default.
 */
import { mkdirSync } from "node:fs";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createBashTool,
  createEditTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@open-instinct/core";
import type { Capability, RegisteredTool, ToolMeta, ToolResultLike } from "@open-instinct/core";

const READ: Capability[] = ["files.read"];
const WRITE: Capability[] = ["files.write"];
const BOTH: Capability[] = ["files.read", "files.write"];

/** Capabilities per Pi tool name. bash can do anything, so it needs both. */
export const FILE_TOOL_CAPABILITIES: Record<string, Capability[]> = {
  read: READ,
  ls: READ,
  grep: READ,
  write: WRITE,
  edit: WRITE,
  bash: BOTH,
};

/** Turn a ready-made Pi AgentTool into a RegisteredTool with policy metadata. */
export function wrapAgentTool(tool: AgentTool<any>, meta: ToolMeta, rename?: string): RegisteredTool {
  return defineTool({
    name: rename ?? tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    meta,
    execute: async (args, ctx, signal): Promise<ToolResultLike> => {
      // Pi tools want a tool call id; we have no Pi-level id here, so derive one from the conversation.
      const id = `${ctx.conversationKey}:${ctx.now().getTime()}`;
      const result = await tool.execute(id, args, signal);
      return {
        content: result.content.map((block) =>
          block.type === "text"
            ? { type: "text" as const, text: block.text }
            : { type: "image" as const, data: block.data, mimeType: block.mimeType },
        ),
        details: result.details,
        ...(result.isError ? { isError: true } : {}),
      };
    },
  });
}

export interface FileToolsOptions {
  /** Include the bash tool. Default true. Turn off for hosts where a shell is not acceptable. */
  bash?: boolean;
}

/**
 * File tools scoped to `workspace`. Relative paths resolve inside it. Note that
 * bash is a real shell with cwd = workspace, not a sandbox; in the Maritime VM
 * the whole machine belongs to this one agent, which is why that is acceptable.
 */
export function fileTools(workspace: string, opts: FileToolsOptions = {}): RegisteredTool[] {
  mkdirSync(workspace, { recursive: true });
  const tools: AgentTool<any>[] = [
    createReadTool(workspace),
    createLsTool(workspace),
    createGrepTool(workspace),
    createWriteTool(workspace),
    createEditTool(workspace),
  ];
  if (opts.bash !== false) tools.push(createBashTool(workspace, { exposeSessionEnvironment: false }));
  return tools.map((t) =>
    wrapAgentTool(t, {
      capabilities: FILE_TOOL_CAPABILITIES[t.name] ?? BOTH,
      group: "files",
      describe: (args) => `${t.name} ${summarizeArgs(args)}`,
    }),
  );
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const path = typeof a.path === "string" ? a.path : undefined;
  const command = typeof a.command === "string" ? a.command : undefined;
  return path ?? command?.slice(0, 80) ?? "";
}

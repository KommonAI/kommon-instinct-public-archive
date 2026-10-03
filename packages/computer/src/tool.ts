/**
 * Local constructors for core's RegisteredTool shape.
 *
 * Only types are imported from @libre-instinct/core so this package has no runtime dependency
 * on core's build output: the tests run on their own, and the server can register these
 * tools in its ToolRegistry because the shape is identical to what core's defineTool returns.
 */
import type { RegisteredTool, ToolResultLike, ToolSpec } from "@libre-instinct/core";
import type { TSchema } from "typebox";

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export function defineTool<T extends TSchema>(spec: ToolSpec<T>): RegisteredTool {
  if (!TOOL_NAME.test(spec.name)) {
    throw new Error(`Invalid tool name "${spec.name}": use [A-Za-z0-9_-], at most 64 characters`);
  }
  return { spec };
}

export function textResult(text: string): ToolResultLike {
  return { content: [{ type: "text", text }] };
}

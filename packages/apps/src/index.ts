export { capabilitiesForSlug, toolkitOfSlug, COMPOSIO_META_TOOLS } from "./capabilities.js";
export {
  ComposioApps,
  APPS_STATE_FILE,
  normalizeToolkits,
  type ComposioAppsOptions,
  type ComposioSessionMode,
  type ComposioSessionLike,
  type ComposioClientLike,
  type SessionCreateConfig,
  type McpEndpoint,
  type AppsState,
} from "./composio.js";
export { appsGuidance } from "./guidance.js";
export { wrapMcpTool, wrapMcpTools, toolNameFor, describeCall, parametersFor, metaFor, TOOL_NAME_PREFIX, type McpToolSource } from "./wrap.js";

/** Toolkits a new agent starts with. */
export const DEFAULT_TOOLKITS: string[] = ["gmail", "googlecalendar", "googlecontacts"];

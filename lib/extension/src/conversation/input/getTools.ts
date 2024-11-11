import { ToolsProvider } from "../../tools/ToolsProvider";

// TODO fix this static folder reference
const tp = new ToolsProvider();

export const getTools = async () => {
  if (!tp.hasLocalTools) return "";

  return tp.getToolsYaml();
};

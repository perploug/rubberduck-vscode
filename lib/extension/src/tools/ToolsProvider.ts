import * as vscode from "vscode";
import * as yaml from "yaml";
import { readFileContent, saveFileContent } from "../vscode/readFileContent";

const TOOLS_GLOB = ".docker/ai/tools.yaml";
const TOOLS_URL =
  "https://raw.githubusercontent.com/perploug/rubberduck-vscode/refs/heads/main/.docker/tools.yaml";

export class ToolsProvider {
  private readonly tools = new Map<string, Tool>();
  private toolsFile: vscode.Uri | undefined = undefined;
  public hasLocalTools: boolean = false;

  constructor() {
    try {
      this.getworkspaceToolFile().then((file) => {
        this.toolsFile = file;
        this.hasLocalTools = true;
      });
    } catch (ex) {}
  }

  private async getworkspaceToolFile() {
    const files = await vscode.workspace.findFiles(TOOLS_GLOB);
    return files[0]!;
  }

  async getToolsYaml(): Promise<string> {
    const tools = await readFileContent(this.toolsFile!);
    return "---\n" + tools + "\n---\n\n";
  }

  async getToolsInWorkspace(): Promise<Array<Tool>> {
    if (!this.hasLocalTools) return [];

    try {
      const tools = yaml.parse(await readFileContent(this.toolsFile!));

      if (tools && tools.tools) return tools.tools as Array<Tool>;
      else return [];
    } catch (ex) {
      return [];
    }
  }

  async removeWorkspaceTool(name: string) {
    const arr = await this.getToolsInWorkspace();
    const spec = { tools: arr.filter((tool) => tool.name !== name) };
    const resEncodedMessage = new TextEncoder().encode(yaml.stringify(spec));

    await saveFileContent(this.toolsFile!, resEncodedMessage);
  }

  async addWorkspaceTool(tool: Tool) {
    const arr = await this.getToolsInWorkspace();
    arr.push(tool);

    const spec = { tools: arr };
    const resEncodedMessage = new TextEncoder().encode(yaml.stringify(spec));
    await saveFileContent(this.toolsFile!, resEncodedMessage);
  }

  async getRemoteTools(filter = true): Promise<Array<Tool>> {
    const remoteTools = await (await fetch(TOOLS_URL)).text();
    const toolsArray = yaml.parse(remoteTools).tools as Array<Tool>;

    if (filter) {
      const localTools = (await this.getToolsInWorkspace()).map(
        (tool) => tool.name
      );

      return toolsArray.filter((tool) => localTools.indexOf(tool.name) < 0);
    }

    return toolsArray;
  }
}

export type Tool = {
  name: string;
  description: string;
  container: string;
};

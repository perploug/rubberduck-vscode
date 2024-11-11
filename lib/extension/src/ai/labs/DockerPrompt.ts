import { ApiKeyManager } from "../ApiKeyManager";
import { Logger } from "../../logger";
import { spawn } from "child_process";
import * as rpc from "vscode-jsonrpc/node";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as vscode from "vscode";
import { Conversation } from "../../conversation/Conversation";
import {
  createEventIterator,
  getDockerCredentials,
  getWorkspaceFolder,
} from "./utills";

// wtf esbuild
const PROMPT_IMAGE = "vonwig/prompts:latest";

export class DockerPrompt {
  private readonly apiKeyManager: ApiKeyManager;
  private readonly logger: Logger;
  private hostDir: string | undefined = undefined;

  constructor({
    apiKeyManager,
    logger,
  }: {
    apiKeyManager: ApiKeyManager;
    logger: Logger;
  }) {
    this.logger = logger;
    this.apiKeyManager = apiKeyManager;
  }

  // Pulls the prompt image for later use by the prompt
  pullPromptImage(image = PROMPT_IMAGE): void {
    const process = spawn("docker", ["pull", image]);

    process.stdout.on("data", (data) => {
      this.logger.error(data.toString());
    });

    process.stderr.on("data", (data) => {
      this.logger.error(data.toString());
    });
  }

  // raw method that accepts the fully rendered templated, with context, rag
  // variables etc.
  async streamText(prompt: string, conversation: Conversation) {
    // these are the references which the container needs

    // root of the project so it know where files etc is
    if (!this.hostDir) this.hostDir = await getWorkspaceFolder();

    if (this.hostDir) this.logger.log(this.hostDir);
    //if (!this.hostDir) throw "Docker prompt: no hostDir";

    // create a unique id to get the right rpc stream
    const uniqueID = conversation.id;

    // store prompt in a standard place (we assume a single convo for now)
    const promptFilePath = path.join(os.tmpdir(), uniqueID + ".md");
    fs.writeFileSync(promptFilePath, prompt, "utf-8");
    this.logger.log(promptFilePath);
    this.logger.log([prompt]);

    // get docker credentials
    const credentails = await getDockerCredentials();

    // get openAi Key and mount it as an accesible secret
    const openAiKey = await this.apiKeyManager.getOpenAIApiKey();
    if (openAiKey) this.writeKeyToVolume(openAiKey);

    this.logger.log("Spawning the prompt image");
    return this.spawnPromptImage(
      promptFilePath,
      this.hostDir,
      credentails.Username,
      credentails.Password,
      uniqueID,
      this.processStreamResponse
    );
  }

  // this spins up the vonwig/prompts image
  // instead of providing a callback, this should return a stream we can
  // yield from and close properly
  private spawnPromptImage = async (
    promptFile: string,
    hostDir: string | undefined,
    username: string,
    pat: string,
    uniqueID: string,
    preprocess: (
      json: any,
      context: { inFunction: boolean; frl: number; response: string },
      cancel: () => void
    ) => any
    //token: CancellationToken
  ) => {
    // put together the container arguments to spawn a docker process
    const args = await this.getPromptImageArgs(
      promptFile!,
      hostDir!,
      username,
      pat,
      process.platform,
      uniqueID
    );

    this.logger.debug(`Running ${args.join(" ")}`);

    // setup a connection to the container via rpc
    const dockerProcess = spawn("docker", args);
    let connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(dockerProcess.stdout),
      new rpc.StreamMessageWriter(dockerProcess.stdin)
    );

    const notificationBuffer: { method: string; params: object }[] = [];

    const pushNotification = (method: string, params: object) => {
      notificationBuffer.push({ method, params });
    };

    connection.onNotification((params) => {
      this.logger.log("RPC: " + JSON.stringify(params));
    });

    // this creates the subscriptions to the differnet RPC types
    for (const [type, properties] of Object.entries(this.rpcNotifications)) {
      // @ts-expect-error
      connection.onNotification(properties, (params) => {
        pushNotification(type, params);
      });
    }

    this.logger.debug("listening to RPC calls");
    connection.listen();

    // holding a context to help with understanding the entire output
    const responseContext = {
      inFunction: false,
      frl: 0,
      response: "",
    };

    return createEventIterator<{ type: string; params: any }>(
      ({ emit, cancel }) => {
        const messageHandler = (type: string, params: any) => {
          this.logger.debug(JSON.stringify({ type, params }));
          if (preprocess) {
            const res = preprocess({ type, params }, responseContext, cancel);
            if (res) emit(res);
          } else {
            emit({ type, params });
          }
        };

        for (const [type, properties] of Object.entries(
          this.rpcNotifications
        )) {
          // @ts-expect-error
          connection.onNotification(properties, (params) => {
            this.logger.debug("rpc: " + type);
            messageHandler(type, params);
          });
        }

        // Cleanup function to unsubscribe and disconnect
        return async () => {
          dockerProcess.kill();
          connection.dispose();
        };
      }
    );
  };

  private processStreamResponse(
    json: {
      type: string;
      params: any;
    },
    context: { inFunction: boolean; frl: number; response: string },
    cancel: () => void
  ): string | undefined {
    function respond(response: string) {
      context.response += response;
      return response;
    }

    switch (json.type) {
      case "functions":
        const {
          id,
          function: { arguments: args },
        } = json.params;
        const params_str = args as string;
        if (!context.inFunction) {
          context.inFunction = true;
          context.frl = params_str.length;
          return `\`\`\`json\n${params_str}`;
        } else {
          const pResonse = params_str.substring(context.frl);
          context.frl = params_str.length;

          return respond(pResonse);
        }
      case "functions-done":
        if (context.inFunction) {
          context.inFunction = false;
          context.frl = 0;

          return respond("\n```\n\n");
        }
        break;
      case "start":
        const { level, role, content } = json.params;
        const header = Array(level + 3)
          .fill("#")
          .join("");
        return respond(
          `${header} ROLE ${role}${content ? ` (${content})` : ""}\n\n`
        );
        break;
      case "functions-done":
        return respond(json.params.content + "\n\n");
        break;
      case "message":
        let res = json.params.content;
        if (res) {
          if (res.startsWith('{"done":')) {
            cancel.call(this);
          } else {
            if (json.params.debug) {
              const backticks = "\n```\n";
              res += `${backticks}# Debug\n${json.params.debug}\n${backticks}\n`;
            }
            return respond(res);
          }
        }
        break;
      case "prompts":
        if (
          !vscode.workspace
            .getConfiguration("docker.labs-ai-tools-vscode")
            .get<boolean>("debug")
        ) {
          break;
        }
        let res2 = "# Rendered Prompt\n\n";
        res2 +=
          json.params.messages
            .map((m: any) => `# ${m.role}\n${m.content}`)
            .join("\n") + "\n";

        return respond(res2);
        break;
      case "error":
        const errorMSG =
          String(json.params.content) + String(json.params.message);
        //postToBackendSocket({ event: 'eventLabsPromptError', properties: { error: errorMSG } });

        return respond("```error\n" + errorMSG + "\n```\n");

        break;
      default:
        return respond(JSON.stringify(json, null, 2));
    }

    return undefined;
  }

  private rpcNotifications = {
    message: new rpc.NotificationType<{ content: string }>("message"),
    error: new rpc.NotificationType<{ content: string }>("error"),
    functions: new rpc.NotificationType<{
      function: { arguments: string; name: string };
      id: string;
    }>("functions"),
    "functions-done": new rpc.NotificationType<{
      id: string;
      function: { name: string; arguments: string };
    }>("functions-done"),
    start: new rpc.NotificationType<{
      id: string;
      function: { name: string; arguments: string };
    }>("start"),
  };

  private getPromptImageArgs = async (
    promptFile: string,
    hostDir: string,
    username: string,
    pat: string,
    platform: string,
    uniqueID: string
  ) => {
    const baseArgs: string[] = [
      "run",

      "--rm",

      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",

      "-v",
      "openai_key:/secret",

      "-v",
      "/run/host-services/backend.sock:/host-services/docker-desktop-backend.sock",

      "--mount",
      `type=bind,source=${promptFile},target=/app/${uniqueID}.md`,

      "-e",
      "OPENAI_API_KEY_LOCATION=/secret",

      "-e",
      "DOCKER_DESKTOP_SOCKET_PATH=/host-services/docker-desktop-backend.sock",

      "vonwig/prompts:latest",

      "run",

      "--host-dir",
      hostDir,

      "--user",
      username,

      "--platform",
      platform,

      "--jsonrpc",

      "--pat",
      pat,

      "--prompts-dir",
      `/app/${uniqueID}.md`,
    ];

    return baseArgs;
  };

  private writeKeyToVolume = async (key: string) => {
    const args1 = ["pull", "vonwig/function_write_files"];

    const payload = {
      files: [{ path: ".openai-api-key", content: key, executable: false }],
    };
    this.logger.debug(JSON.stringify(payload));

    const args2 = [
      "run",
      "-v",
      "openai_key:/secret",
      "--rm",
      "--workdir",
      "/secret",
      "vonwig/function_write_files",
      JSON.stringify(payload),
    ];

    const child1 = spawn("docker", args1);
    child1.stdout.on("data", (data) => {
      this.logger.log(data.toString());
    });
    child1.stderr.on("data", (data) => {
      this.logger.log(data.toString());
    });

    const child2 = spawn("docker", args2);
    child2.stdout.on("data", (data) => {
      this.logger.log(data.toString());
    });
    child2.stderr.on("data", (data) => {
      this.logger.log(data.toString());
    });
  };
}

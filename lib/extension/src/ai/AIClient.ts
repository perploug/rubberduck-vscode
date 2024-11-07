import {
  InstructionPrompt,
  OpenAITextEmbeddingResponse,
  TextStreamingModel,
  embed,
  llamacpp,
  openai,
  streamText,
} from "modelfusion";

import * as vscode from "vscode";
import { z } from "zod";
import { Logger } from "../logger";
import { ApiKeyManager } from "./ApiKeyManager";
import { DockerPrompt } from "./labs/DockerPrompt";
import { Conversation } from "../conversation/Conversation";

function getOpenAIBaseUrl(): string {
  return (
    vscode.workspace
      .getConfiguration("rubberduck.openAI")
      .get("baseUrl", "https://api.openai.com/v1/")
      // Ensure that the base URL doesn't have a trailing slash:
      .replace(/\/$/, "")
  );
}

function getModel() {
  return z
    .enum([
      "gpt-4",
      "gpt-4-32k",
      "gpt-4-1106-preview",
      "gpt-4-0125-preview",
      "gpt-4-turbo-preview",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-16k",
      "gpt-3.5-turbo-1106",
      "gpt-3.5-turbo-0125",
      "llama.cpp",
    ])
    .parse(vscode.workspace.getConfiguration("rubberduck").get("model"));
}

export class AIClient {
  private readonly apiKeyManager: ApiKeyManager;
  private readonly logger: Logger;
  private readonly dockerPrompt: DockerPrompt;
  constructor({
    apiKeyManager,
    logger,
  }: {
    apiKeyManager: ApiKeyManager;
    logger: Logger;
  }) {
    this.apiKeyManager = apiKeyManager;
    this.logger = logger;

    this.dockerPrompt = new DockerPrompt({
      apiKeyManager: this.apiKeyManager,
      logger: this.logger,
    });

    // pull the standard prompt image
    this.logger.log("pulling the prompt image");
    this.dockerPrompt.pullPromptImage();
  }

  private async getOpenAIApiConfiguration() {
    const apiKey = await this.apiKeyManager.getOpenAIApiKey();

    if (apiKey == undefined) {
      throw new Error(
        "No OpenAI API key found. " +
          "Please enter your OpenAI API key with the 'Rubberduck: Enter OpenAI API key' command."
      );
    }

    return openai.Api({
      baseUrl: getOpenAIBaseUrl(),
      apiKey,
    });
  }

  // these 3 are wired up the in the conversation class
  // will hardcode in the labs AI client directly in conversation instead of
  // reimplementing this Client class, event though that would be the right
  // thing to do

  // this one is essentially unneeded as we will override this whole thing
  async getTextStreamingModel({
    maxTokens,
    stop,
    temperature = 0,
  }: {
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }): Promise<TextStreamingModel<InstructionPrompt>> {
    const modelConfiguration = getModel();

    return modelConfiguration === "llama.cpp"
      ? llamacpp
          .CompletionTextGenerator({
            // TODO the prompt format needs to be configurable for non-Llama2 models
            promptTemplate: llamacpp.prompt.Llama2,
            maxGenerationTokens: maxTokens,
            stopSequences: stop,
            temperature,
          })
          .withInstructionPrompt()
      : openai
          .ChatTextGenerator({
            api: await this.getOpenAIApiConfiguration(),
            model: modelConfiguration,
            maxGenerationTokens: maxTokens,
            stopSequences: stop,
            temperature,
            frequencyPenalty: 0,
            presencePenalty: 0,
          })
          .withInstructionPrompt();
  }

  // this is the only thing we will basically need to reimplement
  async streamText({
    conversation,
    prompt,
    maxTokens,
    stop,
    temperature = 0,
  }: {
    conversation: Conversation;
    prompt: string;
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }) {
    this.logger.log(["--- Start prompt ---", prompt, "--- End prompt ---"]);

    // docker specific prompt engine
    return this.dockerPrompt.streamText(prompt, conversation);
  }

  async generateEmbedding({ input }: { input: string }) {
    try {
      const { embedding, rawResponse } = await embed({
        model: openai.TextEmbedder({
          api: await this.getOpenAIApiConfiguration(),
          model: "text-embedding-ada-002",
        }),
        value: input,
        fullResponse: true,
      });

      return {
        type: "success" as const,
        embedding,
        totalTokenCount: (rawResponse as OpenAITextEmbeddingResponse).usage
          ?.total_tokens,
      };
    } catch (error: any) {
      console.log(error);

      return {
        type: "error" as const,
        errorMessage: error?.message,
      };
    }
  }
}

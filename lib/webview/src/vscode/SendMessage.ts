import { OutgoingMessage } from "@rubberduck/common/src/webview-api/OutgoingMessage";
import { vscodeApi } from "./VsCodeApi";

export type SendMessage = (message: OutgoingMessage) => void;

export const sendMessage: SendMessage = (message) => {
  vscodeApi.postMessage(message);
};

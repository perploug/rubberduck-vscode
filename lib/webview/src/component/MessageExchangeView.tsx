import { webviewApi } from "@rubberduck/common";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChatInput } from "./ChatInput";
import { ErrorMessage } from "./ErrorMessage";

export function MessageExchangeView({
  content,
  onClickDismissError,
  onClickRetry,
  onSendMessage,
}: {
  content: webviewApi.MessageExchangeContent;
  onSendMessage: (message: string) => void;
  onClickDismissError: () => void;
  onClickRetry: () => void;
}) {
  const [inputText, setInputText] = useState("");

  return (
    <div className="message-exchange">
      <div className={`messages`}>  
        <div>
        {content.messages.map((message, i) => (
          <div className={`message ${message.author}`} key={i}>
            {message.author === "user" && message.content}
            {message.author === "bot" && (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            )}
          </div>
        ))}
        </div>
      </div>

      <div className={`messages-footer`}>
          
      {(() => {
        const type = content.state.type;
        switch (type) {
          case "waitingForBotAnswer":
            return (
              <div className="message bot">
                {content.state.botAction ?? ""}
                <span className={"in-progress"} />
              </div>
            );
          case "botAnswerStreaming":
            return (
              <div className="message bot">
                <ReactMarkdown>
                  {content.state.partialAnswer ?? ""}
                </ReactMarkdown>
                <span className={"in-progress"} />
              </div>
            );
          case "userCanReply":
            return (
              <ChatInput
                placeholder={
                  content.state.responsePlaceholder ??
                  content.messages.length > 0
                    ? "Reply…"
                    : "Ask me…"
                }
                text={inputText}
                onChange={setInputText}
                onSubmit={() => {
                  onSendMessage(inputText);
                  setInputText("");
                }}
              />
            );
          default: {
            const exhaustiveCheck: never = type;
            throw new Error(`unsupported type: ${exhaustiveCheck}`);
          }
        }
      })()}
      </div>

      {content.error && (
        <ErrorMessage
          error={content.error}
          onClickDismiss={onClickDismissError}
          onClickRetry={onClickRetry}
        />
      )}
    </div>
  );
}

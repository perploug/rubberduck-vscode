import React, { useCallback, useRef, useState } from "react";
import { sendMessage, SendMessage } from "../vscode/SendMessage";
import { OutgoingMessage } from "http";


export const ChatInput: React.FC<{
  placeholder?: string;
  disabled?: boolean;
  text: string;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  shouldCreateNewLineOnEnter?: boolean;
}> = ({
  placeholder,
  disabled,
  text,
  onChange,
  onSubmit,
  shouldCreateNewLineOnEnter,
}) => {

  let bound = false;
  if(!bound){
    bound = true;
    
  }


  // callback to automatically focus the input box
  const callbackRef = useCallback((inputElement: HTMLTextAreaElement) => {
    if (inputElement) {
      // delay focus (auto-focussing the input box did not work otherwise)
      setTimeout(() => {
        inputElement.focus();
      }, 50);
    }
  }, []);

  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  
  
  function getUrl(textarea : HTMLTextAreaElement){
    const handler = function(event : any){
      const message = event!.data;

      if (message.command === 'receiveFilePath') {
        console.log(message.message)

        if(message.message){
          let currentVal = textarea.value;
          textarea.value = currentVal.substring(0, currentVal.length-1) + "./" + message.message;
          textarea.focus();
        }

        //textareaWrapperRef.current?.innerText = message.message;
        window.removeEventListener("message", handler);
      }
    }  

    sendMessage({type: "insertFilePath"});
    window.addEventListener('message', handler);
  }



  return (
    <div className="chat-input" ref={textareaWrapperRef}>
      <textarea
        disabled={disabled}
        ref={callbackRef}
        placeholder={placeholder}
        value={text}
        rows={1}
        onInput={(event) => {
          if (!textareaWrapperRef.current) return;

          // `replicatedValue` is used in the CSS to expand the input
          textareaWrapperRef.current.dataset.replicatedValue =
            event.currentTarget.value;
          onChange?.(event.currentTarget.value);
        }}
        // capture onKeyDown to prevent the user from adding enter to the input
        onKeyDown={(event) => {          
          
          if (event.key === "@"){
            ///@ts-ignore
            getUrl(event.target); 
            return;
          }

          if (
            !(event.target instanceof HTMLTextAreaElement) ||
            event.shiftKey ||
            onSubmit == null ||
            event.key !== "Enter" ||
            // If we can create new lines, only submit if Ctrl/Cmd+Enter
            (shouldCreateNewLineOnEnter && !event.ctrlKey && !event.metaKey)
          ) {
            return;
          }

          const value = event.target.value.trim();

          if (value !== "") {
            event.preventDefault();
            event.stopPropagation();
            onSubmit(value);
          }
        }}
      />
    </div>
  );
};

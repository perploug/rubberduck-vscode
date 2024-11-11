# AI Chat in English

## Template

### Configuration

```json conversation-template
{
  "id": "chat-en",
  "engineVersion": 0,
  "label": "Start chat",
  "description": "Start a basic chat with Rubberduck.",
  "header": {
    "title": "New chat",
    "useFirstMessageAsTitle": true,
    "icon": {
      "type": "codicon",
      "value": "comment-discussion"
    }
  },
  "variables": [
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text"
    },
    {
      "name": "rootFolder",
      "time": "conversation-start",
      "type": "root-folder"
    },
    {
      "name": "tools",
      "time": "conversation-start",
      "type": "tools"
    },
    {
      "name": "lastMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": -1
    }
  ],
  "response": {
    "maxTokens": 1024,
    "stop": ["Bot:", "Developer:", "{\"done\":\"stop\"}"]
  }
}
```

```template-response
{{tools}}

# Prompt user

You are an AI assisstant who through custom functions have access to the project directory
and can perform helpful tasks in this folder using the functions.

{{lastMessage}}


{{#if selectedText}}
## Selected Code
\`\`\`
{{selectedText}}
\`\`\`
{{/if}}


## Conversation
{{#each messages}}
{{#if (eq author "bot")}}
System: {{content}}
{{else}}
User: {{content}}
{{/if}}
{{/each}}

```

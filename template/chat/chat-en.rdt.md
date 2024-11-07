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
---
tools:
  - name: docker
    description: run any docker command with arguments
    parameters:
      type: object
      properties:
        args:
          type: string
          description: arguments to pass to the docker CLI
    container:
      image: docker:cli
      command:
        - "\{{args|safe}}"
---
# Prompt user

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

# IPC Map

The Inter-Process Communication (IPC) bridge is defined in `preload/index.ts` and consumed via `window.electronAPI`.

## Chat & Proxy
| Channel | Type | Payload | Description |
|---------|------|---------|-------------|
| `chat:send` | send | `ChatMessage[], reqId` | Initiates chat request |
| `chat:cancel` | send | `reqId` | Cancels streaming request |
| `chat:start` | receive | `reqId` | Stream begins |
| `chat:token` | receive | `reqId, string` | Stream chunk |
| `chat:done` | receive | `reqId` | Stream completed |
| `chat:error` | receive | `reqId, string` | Stream error |
| `proxy:status` | receive | `'connected'\|'connecting'\|...` | Local proxy status |

## Memory
| Channel | Type | Payload | Description |
|---------|------|---------|-------------|
| `memory:save-explicit` | invoke | `title, content, tags` | Saves explicitly into Vault |
| `memory:delete-vault` | invoke | `id` | Deletes a Vault entry |
| `memory:get-vault` | invoke | - | Retrieves all Vault entries |
| `memory:get-profile` | invoke | - | Retrieves user profile config |
| `memory:update-profile` | invoke | `key, value` | Patches profile config |
| `memory:migrate-data` | invoke | `ChatMessage[]` | Analyzes history for memories |
| `memory:get-status` | invoke | - | Gets DB stats |
| `chat:memory-used` | receive | `reqId, Array<{label, score}>` | Notifies Renderer of semantic matches |

## Voice
| Channel | Type | Payload | Description |
|---------|------|---------|-------------|
| `voice:speak` | invoke | `text` | Requests speech |
| `voice:stop` | invoke | - | Halts current speech |
| `voice:get-status`| invoke | - | Gets state and config |
| `voice:set-config`| invoke | `Partial<VoiceConfig>` | Updates voice settings |
| `voice:state-changed`| receive | `state, reason, reqId` | Notifies UI of state changes |
| `voice:play-text` | receive | `reqId, text, voiceId` | Commands Renderer to play text via Web Speech |
| `voice:stop-playback`| receive| - | Commands Renderer to cancel Web Speech |

## System / Action
| Channel | Type | Payload | Description |
|---------|------|---------|-------------|
| `action:execute` | invoke | `string` | Executes a slash command |
| `widget:resize` | send | `height` | Adjusts window bounds |
| `widget:panel-state`| send | `isOpen` | Toggles blur/focus states |
| `app:quit` | send | - | Terminates application |

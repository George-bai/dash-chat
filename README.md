# dash-chat

[![PyPI version](https://badge.fury.io/py/dash-chat.svg)](https://pypi.org/project/dash-chat/)
[![Supported Python versions](https://img.shields.io/pypi/pyversions/dash-chat.svg)](https://pypi.org/project/dash-chat/)
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/gbolly/dash-chat/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/gbolly/dash-chat/tree/main)

`dash-chat` is a Dash component library that ships a complete chat surface. It provides a responsive UI, Markdown rendering, file uploads, streaming indicators, historical chat loading, and Dash-friendly state management so you can connect any LLM or rules-based assistant.

## Features
- **Dash-first integration** – send messages via the `new_message` property and push updates through `messages` without writing custom React.
- **Rich message rendering** – render Markdown, attachments, Plotly graphs, tables, or mixed content payloads from the backend.
- **File uploads** – allow users to attach files and control accepted types via `supported_input_file_types`; previews are shown for images and common documents.
- **Persistence support** – opt into local or session storage; a built-in overflow menu lets users clear stored history.
- **Streaming friendly** – Server-Sent Events (SSE) hooks display live assistant responses, emit `streaming_complete`, show stop controls, and automatically parse `<think>...</think>` reasoning blocks into collapsible sections.
- **Historical loading** – react to the `load_more_messages` trigger when a user scrolls to the top of the transcript to fetch older conversations on demand.
- **Customizable look and feel** – override light/dark theme colors, bubble styles, container sizing, and typing indicators.

## Installation

```bash
pip install dash-chat
```

## Quick start
The `ChatComponent` expects a list of message dictionaries and emits the latest user message through the `new_message` property. Each message must include a `role` (`"user"` or `"assistant"`) and a `content` payload. For proper ordering and timestamp display, include unique `id` and `timestamp` fields in milliseconds when you append server responses.

```python
import time
import dash
from dash import Dash, Input, Output, State, callback, html
from dash_chat import ChatComponent

app = Dash(__name__)

app.layout = html.Div(
    ChatComponent(
        id="chat-component",
        messages=[
            {
                "id": "welcome",
                "timestamp": int(time.time() * 1000),
                "role": "assistant",
                "content": "Hello! Ask me something and I'll respond.",
            }
        ],
        theme="light",
        typing_indicator="dots",
        persistence=True,
        persistence_type="local",
    )
)

@callback(
    Output("chat-component", "messages"),
    Input("chat-component", "new_message"),
    State("chat-component", "messages"),
    prevent_initial_call=True,
)
def respond_to_user(new_message, messages):
    if not new_message:
        return messages

    updated = messages + [new_message]

    if new_message["role"] == "user":
        reply = {
            "id": f"assistant-{int(time.time() * 1000)}",
            "timestamp": int(time.time() * 1000),
            "role": "assistant",
            "content": "Hello John Doe.",
        }
        return updated + [reply]

    return updated

if __name__ == "__main__":
    app.run(debug=True)
```

## Message format and renderers
`content` can be either a string, a structured dictionary, or a list mixing the supported renderers. The following payloads are rendered out of the box:

| Type | Example payload | Notes |
|------|-----------------|-------|
| Markdown text | `"This will **render** as Markdown."` | Strings are interpreted as Markdown using `react-markdown` and GFM. |
| Structured text | `{ "type": "text", "text": "This will be rendered as Markdown." }` | Useful when composing a mixed list of items. |
| Attachment | `{ "type": "attachment", "file": "data:image/png;base64,...", "fileName": "plot.png", "fileType": "image/png" }` | Images are rendered inline; other files show a download link. |
| Plotly graph | `{ "type": "graph", "props": { "figure": {...}, "config": {...}, "responsive": True } }` | Accepts most `dcc.Graph` props including `figure`, `config`, and responsiveness controls. |
| Table | `{ "type": "table", "header": [...], "data": [...], "props": {"striped": True, "responsive": True} }` | Mirrors `dash-bootstrap-components` table options. |
| Mixed content | `[{"type": "text", ...}, {"type": "graph", ...}, {"type": "table", ...}]` | Items are rendered vertically in order. |

See the [`usage/`](usage) directory for runnable Dash apps that exercise each renderer, including combined text/graph/table outputs and file handling examples.

### Handling file uploads
The built-in composer exposes a paperclip button. Configure `supported_input_file_types` with a MIME string or list (e.g., `[".png", ".jpg", ".pdf"]`). When a user sends a message, any selected file is base64-encoded and appended to the outgoing `content` as an attachment. Your Dash callback can forward the encoded payload directly to your LLM API or decode and upload it as needed.

### Persistence
Set `persistence=True` to automatically cache messages in `localStorage` or `sessionStorage`. On load the component restores prior messages, and the overflow menu in the top-right corner lets the user clear stored history. Specify `persistence_type="local"` or `"session"` according to your retention needs.

## Streaming responses with SSE
Enable real-time assistant updates by turning on the streaming props:

- `streaming_enabled=True` to activate streaming mode.
- Update `sse_endpoint` with the URL of your SSE stream whenever the user sends a message.
- Listen to `streaming_complete` to know which message finished streaming (the value is the streamed message id).
- `show_thinking_process`, `thinking_auto_collapse`, and `thinking_collapse_delay` control how `<think>...</think>` reasoning blocks are displayed while streaming.

```python
from dash import Input, Output, State, callback, no_update
from dash_chat import ChatComponent

@callback(
    Output("assistant-chat", "sse_endpoint"),
    Input("assistant-chat", "new_message"),
    State("assistant-chat", "messages"),
    prevent_initial_call=True,
)
def start_stream(new_message, messages):
    if new_message and new_message.get("role") == "user":
        encoded_prompt = urllib.parse.quote(new_message["content"])
        return f"/api/sse/chat?prompt={encoded_prompt}&message_id={new_message['id']}"
    return no_update
```

The component expects JSON SSE events with a `type` field. The following event types are consumed internally:

| Event type | Required fields | Effect |
|------------|-----------------|--------|
| `stream_start` | `message_id`, optional `role` | Creates the streaming placeholder and switches the input button to a stop icon. |
| `content` | `message_id`, `chunk` | Appends token text to the in-progress response and hides the typing indicator on first receipt. |
| `thinking_start` / `thinking_end` | `message_id` | Marks whether subsequent `content` chunks belong to a collapsible “Thinking process” block (for `<think>` tags). |
| `stream_complete` | `message_id`, optional `full_content` | Finalizes the assistant message, emits `streaming_complete`, and closes the SSE connection. |
| `error` | `message_id`, `error` | Records an error bubble and resets the stream state. |

See [`app_langchain_example.py`](app_langchain_example.py) and the reusable [`LangChainSSEHandler`](langchain_sse_handler.py) for a full-stack example that streams Ollama completions with reasoning traces via LangChain. Pressing the stop button closes the SSE connection and inserts a “Response stopped by user.” message automatically.

## Loading older conversations
When users scroll near the top of the transcript the component increments the `load_more_messages` property. Monitor this value in a callback to fetch and prepend older messages from your datastore. Remember to include stable `id` values so the component can maintain scroll position as history loads.

## Component properties

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | – | Unique component identifier for Dash callbacks. |
| `messages` | `list[dict]` | `[]` | Chat transcript. Each item needs `role` (`"user"` or `"assistant"`) and `content`; include `id` and `timestamp` to enable timestamps and stable ordering. |
| `new_message` | `dict` | – | Latest user message emitted by the component. Treat as read-only. |
| `streaming_complete` | `string` | – | Message id emitted when a streaming assistant response finishes. |
| `load_more_messages` | `number` | `0` | Incremented when the user scrolls to the top threshold, signalling that older history should be loaded. |
| `theme` | `string` | "light" | Set to "dark" for the dark theme variant. |
| `typing_indicator` | "dots" \| "spinner" | "dots" | Controls the typing indicator style while awaiting an assistant reply. |
| `container_style` | `dict` | `None` | Inline styles applied to the outer container. |
| `class_name` | `string` | "" | Custom CSS class on the container. |
| `fill_height` | `bool` | `True` | Stretch to 100% height; set `False` to constrain the widget. |
| `fill_width` | `bool` | `True` | Stretch to available width; set `False` to constrain to 50%. |
| `input_container_style` | `dict` | `None` | Styles for the composer wrapper. |
| `input_text_style` | `dict` | `None` | Styles for the textarea element. |
| `input_placeholder` | `string` | "" | Placeholder text for the composer. |
| `user_bubble_style` | `dict` | defaults to a light blue bubble | Merge custom styles into the user bubble. |
| `assistant_bubble_style` | `dict` | defaults to a gray bubble | Merge custom styles into the assistant bubble. |
| `supported_input_file_types` | `string` \| `list[string]` | "*/*" | Accept attribute for the file input. |
| `persistence` | `bool` | `False` | Persist messages in browser storage. |
| `persistence_type` | "local" \| "session" | "local" | Storage location when persistence is enabled. |
| `streaming_enabled` | `bool` | `False` | Enables SSE streaming logic. |
| `sse_endpoint` | `string` | `None` | SSE endpoint URL. Update this when you initiate a stream. |
| `show_thinking_process` | `bool` | `True` | Toggle display of collapsible thinking sections. |
| `thinking_auto_collapse` | `bool` | `True` | Collapse thinking sections automatically after completion. |
| `thinking_collapse_delay` | `number` | `300` | Delay (ms) before auto-collapsing completed thinking sections. |
| `typewriter_speed` | `number` | `10` | Reserved for fine-grained streaming animations (currently not used by the React implementation). |

## Examples
- [`usage/usage.py`](usage/usage.py): minimal echo bot with persistence.
- [`usage/usage_with_image.py`](usage/usage_with_image.py): OpenAI Vision-style upload workflow.
- [`usage/usage_graph_renderer.py`](usage/usage_graph_renderer.py): Plotly graph renderer.
- [`usage/usage_table_renderer.py`](usage/usage_table_renderer.py): Dash Bootstrap table renderer.
- [`usage/usage_combine_rendering.py`](usage/usage_combine_rendering.py): Mixed text, chart, and table output.
- [`app_langchain_example.py`](app_langchain_example.py): Streaming LangChain + Ollama demo.

## License

This project is licensed under the MIT License. See [LICENSE.txt](LICENSE.txt) for details.

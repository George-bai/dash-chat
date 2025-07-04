# AUTO GENERATED FILE - DO NOT EDIT

from dash.development.base_component import Component, _explicitize_args


class ChatComponent(Component):
    """A ChatComponent component.
    ChatComponent - A React-based chat interface with customizable styles and typing indicators.
    * This component provides a chat interface with support for:
    - Displaying messages exchanged between 2 users typically a user and an assistant.
    - Customizable themes and styles for the chat UI.
    - Typing indicators for both the user and assistant.
    - Integration with Dash via the `setProps` callback for state management.

    Keyword arguments:

    - id (string; optional):
        The ID of this component, used to identify dash components in
        callbacks. The ID needs to be unique across all of the components
        in an app.

    - assistant_bubble_style (dict; optional):
        Css styles to customize the assistant message bubble.

    - class_name (string; default ""):
        Name for the class attribute to be added to the chat container.

    - container_style (dict; optional):
        Inline css styles to customize the chat container.

    - fill_height (boolean; default True):
        Whether to vertically fill the screen with the chat container. If
        False, centers and constrains container to a maximum height.

    - fill_width (boolean; default True):
        Whether to horizontally fill the screen with the chat container.
        If False, centers and constrains container to a maximum width.

    - input_container_style (dict; optional):
        Inline styles for the container holding the message input field.

    - input_placeholder (string; default ""):
        Placeholder input to bne used in the input field.

    - input_text_style (dict; optional):
        Inline styles for the message input field itself.

    - messages (list of dicts; optional):
        An array of options. The list of chat messages. Each message
        object should have:    - `role` (string): The message sender,
        either \"user\" or \"assistant\".    - `content`: The content of
        the message.

        `messages` is a list of dicts with keys:

        - role (a value equal to: "user", "assistant"; required)

        - content (list | string | dict; required)

    - new_message (dict; optional):
        Latest chat message that was appended to messages array.

    - persistence (boolean; default False):
        Whether messages should be stored for persistence.

    - persistence_type (a value equal to: "local", "session"; default "local"):
        Where persisted messages will be stored.

    - supported_input_file_types (string | list of strings; default "*/*"):
        String or array of file types to accept in the attachment file
        input.

    - theme (string; default "light"):
        Theme for the chat interface. Default is \"light\". Use \"dark\"
        for a dark mode appearance.

    - typing_indicator (a value equal to: "dots", "spinner"; default "dots"):
        The type of typing indicator to display. Options are:    -
        `\"dots\"`: Displays animated dots.    - `\"spinner\"`: Displays a
        spinner animation.

    - user_bubble_style (dict; optional):
        Css styles to customize the user message bubble.

    - streaming_enabled (boolean; default False):
        Enable SSE streaming functionality.

    - sse_endpoint (string; optional):
        SSE endpoint URL for streaming messages.

    - show_thinking_process (boolean; default True):
        Show thinking process sections.

    - thinking_auto_collapse (boolean; default True):
        Auto-collapse thinking sections when complete.

    - thinking_collapse_delay (number; default 300):
        Delay before auto-collapsing thinking sections (ms).

    - typewriter_speed (number; default 30):
        Speed of typewriter effect for thinking content (ms per character).

    - streaming_complete (string; optional):
        Fired when streaming completes for a message."""

    _children_props = []
    _base_nodes = ["children"]
    _namespace = "dash_chat"
    _type = "ChatComponent"

    @_explicitize_args
    def __init__(
        self,
        id=Component.UNDEFINED,
        messages=Component.UNDEFINED,
        theme=Component.UNDEFINED,
        container_style=Component.UNDEFINED,
        typing_indicator=Component.UNDEFINED,
        new_message=Component.UNDEFINED,
        input_container_style=Component.UNDEFINED,
        input_text_style=Component.UNDEFINED,
        fill_height=Component.UNDEFINED,
        fill_width=Component.UNDEFINED,
        user_bubble_style=Component.UNDEFINED,
        assistant_bubble_style=Component.UNDEFINED,
        input_placeholder=Component.UNDEFINED,
        class_name=Component.UNDEFINED,
        persistence=Component.UNDEFINED,
        persistence_type=Component.UNDEFINED,
        supported_input_file_types=Component.UNDEFINED,
        streaming_enabled=Component.UNDEFINED,
        sse_endpoint=Component.UNDEFINED,
        show_thinking_process=Component.UNDEFINED,
        thinking_auto_collapse=Component.UNDEFINED,
        thinking_collapse_delay=Component.UNDEFINED,
        typewriter_speed=Component.UNDEFINED,
        streaming_complete=Component.UNDEFINED,
        **kwargs
    ):
        self._prop_names = [
            "id",
            "assistant_bubble_style",
            "class_name",
            "container_style",
            "fill_height",
            "fill_width",
            "input_container_style",
            "input_placeholder",
            "input_text_style",
            "messages",
            "new_message",
            "persistence",
            "persistence_type",
            "supported_input_file_types",
            "theme",
            "typing_indicator",
            "user_bubble_style",
            "streaming_enabled",
            "sse_endpoint",
            "show_thinking_process",
            "thinking_auto_collapse",
            "thinking_collapse_delay",
            "typewriter_speed",
            "streaming_complete",
        ]
        self._valid_wildcard_attributes = []
        self.available_properties = [
            "id",
            "assistant_bubble_style",
            "class_name",
            "container_style",
            "fill_height",
            "fill_width",
            "input_container_style",
            "input_placeholder",
            "input_text_style",
            "messages",
            "new_message",
            "persistence",
            "persistence_type",
            "supported_input_file_types",
            "theme",
            "typing_indicator",
            "user_bubble_style",
            "streaming_enabled",
            "sse_endpoint",
            "show_thinking_process",
            "thinking_auto_collapse",
            "thinking_collapse_delay",
            "typewriter_speed",
            "streaming_complete",
        ]
        self.available_wildcard_properties = []
        _explicit_args = kwargs.pop("_explicit_args")
        _locals = locals()
        _locals.update(kwargs)  # For wildcard attrs and excess named props
        args = {k: _locals[k] for k in _explicit_args}

        super(ChatComponent, self).__init__(**args)

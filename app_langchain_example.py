import dash
from dash import html, callback, Input, Output, State, no_update
from flask import Flask, request
import urllib.parse
from dash_chat import ChatComponent
from langchain_sse_handler import LangChainSSEHandler
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask server
server = Flask(__name__)

# Initialize Dash app
app = dash.Dash(__name__, server=server)

# Initialize LangChain SSE handler with Ollama
sse_handler = LangChainSSEHandler(
    ollama_host="http://localhost:11434",
    model="qwen3:32b"
)

# Track processed messages to prevent loops
processed_messages = set()

# SSE endpoint
@server.route('/api/sse/chat')
def sse_chat():
    """SSE endpoint for streaming chat responses."""
    prompt = request.args.get('prompt', '')
    message_id = request.args.get('message_id', '')
    
    if not prompt or not message_id:
        logger.error("Missing prompt or message_id in SSE request")
        return "Missing required parameters", 400
    
    # Decode URL-encoded prompt
    prompt = urllib.parse.unquote(prompt)
    
    logger.info(f"Starting SSE stream for message {message_id}")
    logger.info(f"Prompt: {prompt[:100]}...")  # Log first 100 chars
    
    # Check if we've already processed this message
    if message_id in processed_messages:
        logger.info(f"Message {message_id} already processed, skipping")
        return "Message already processed", 200
    
    processed_messages.add(message_id)
    
    # Create SSE response using LangChain
    return sse_handler.create_sse_response(prompt, message_id)

# Define the layout
app.layout = html.Div([
    html.H1("Dash Chat with LangChain & Ollama Streaming", 
            style={'textAlign': 'center', 'marginBottom': '20px'}),
    
    html.Div([
        ChatComponent(
            id='langchain-chat',
            messages=[
                {
                    "role": "assistant",
                    "content": "Hello! I'm connected to Ollama via LangChain. Ask me anything and I'll think through my response before answering.",
                    "id": "initial-message"
                }
            ],
            streaming_enabled=True,
            sse_endpoint='',  # Will be set dynamically
            show_thinking_process=True,
            thinking_auto_collapse=True,
            thinking_collapse_delay=500,
            typewriter_speed=30,
            persistence=True,
            theme='light',
            fill_height=True,
            fill_width=True,
            input_placeholder="Type your message here..."
        )
    ], style={'height': '100vh', 'padding': '20px'})
])

# Handle new messages and trigger streaming
@callback(
    Output('langchain-chat', 'sse_endpoint'),
    Input('langchain-chat', 'new_message'),
    State('langchain-chat', 'messages'),
    prevent_initial_call=True
)
def trigger_streaming(new_message, messages):
    """Trigger SSE streaming when user sends a message."""
    if new_message and new_message.get('role') == 'user':
        # Create SSE endpoint URL with prompt and message ID
        prompt = new_message.get('content', '')
        message_id = str(new_message.get('id', ''))
        
        if prompt and message_id:
            # URL encode the prompt to handle special characters
            encoded_prompt = urllib.parse.quote(prompt)
            endpoint = f'/api/sse/chat?prompt={encoded_prompt}&message_id={message_id}'
            
            logger.info(f"Triggering SSE for message {message_id}")
            return endpoint
    
    return no_update

# Handle streaming completion
@callback(
    Output('langchain-chat', 'messages', allow_duplicate=True),
    Input('langchain-chat', 'streaming_complete'),
    State('langchain-chat', 'messages'),
    prevent_initial_call=True
)
def handle_streaming_complete(completed_message_id, messages):
    """Handle when streaming completes."""
    if completed_message_id:
        logger.info(f"Streaming completed for message {completed_message_id}")
        # Optionally update messages or perform cleanup
    return no_update

# Clean up processed messages periodically (optional)
# Note: before_first_request is deprecated in Flask 2.3+
# Using a simple startup approach instead
def start_cleanup_task():
    """Start background task to clean up old processed messages."""
    import threading
    import time
    
    def cleanup():
        while True:
            time.sleep(300)  # Every 5 minutes
            if len(processed_messages) > 1000:
                # Keep only the last 500 messages
                processed_messages.clear()
                logger.info("Cleared processed messages cache")
    
    thread = threading.Thread(target=cleanup, daemon=True)
    thread.start()

# Start cleanup task when module loads
start_cleanup_task()

if __name__ == '__main__':
    print("Starting Dash Chat with LangChain & Ollama")
    print("Make sure Ollama is running with qwen3:32b model")
    print("Access the app at http://localhost:8050")
    
    # Run the app
    app.run(debug=True, host='0.0.0.0', port=8050)
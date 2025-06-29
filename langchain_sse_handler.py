import json
import uuid
import time
import threading
import queue
from typing import Generator, Dict, Any, Optional
from flask import Response, stream_with_context

try:
    # Try new import first (langchain-ollama package)
    from langchain_ollama import OllamaLLM
except ImportError:
    # Fall back to community import
    from langchain_community.llms import Ollama as OllamaLLM

from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.outputs import LLMResult


class LangChainSSEHandler:
    """SSE handler using LangChain with Ollama for streaming responses."""
    
    def __init__(self, ollama_host: str = "http://localhost:11434", model: str = "qwen3:32b"):
        self.ollama_host = ollama_host
        self.model = model
        self.active_streams: Dict[str, Dict] = {}
        
    def _format_sse(self, data: Dict[str, Any]) -> str:
        """Format data for Server-Sent Events."""
        return f"data: {json.dumps(data)}\n\n"
    
    def create_sse_response(self, prompt: str, message_id: str = None) -> Response:
        """Create SSE response for streaming LLM output using LangChain."""
        if not message_id:
            message_id = str(uuid.uuid4())
        
        # Create a queue for real-time event streaming
        event_queue = queue.Queue()
        
        # Store stream metadata
        self.active_streams[message_id] = {
            'prompt': prompt,
            'start_time': time.time(),
            'content': '',
            'queue': event_queue
        }
        
        class RealTimeSSECallback(BaseCallbackHandler):
            """Callback that sends SSE events in real-time."""
            
            def __init__(self, message_id: str, event_queue: queue.Queue):
                super().__init__()
                self.message_id = message_id
                self.event_queue = event_queue
                self.full_content = ""
                self.in_thinking = False
                self.buffer = ""
                
            def on_llm_start(self, serialized: Dict[str, Any], prompts: list[str], **kwargs) -> None:
                """Called when LLM starts."""
                self.event_queue.put({
                    'type': 'stream_start',
                    'message_id': self.message_id,
                    'role': 'assistant'
                })
                
            def on_llm_new_token(self, token: str, **kwargs) -> None:
                """Process each new token from the LLM."""
                print(f"[SSE] New token received - length: {len(token)}, preview: {repr(token[:50])}")
                self.full_content += token
                self.buffer += token
                
                # Process buffer for thinking tags with rate limiting
                import time
                if not hasattr(self, 'last_send_time'):
                    self.last_send_time = 0
                
                current_time = time.time()
                # Rate limit: minimum 20ms between sends for smooth animation
                if current_time - self.last_send_time >= 0.02:
                    self._process_buffer()
                    self.last_send_time = current_time
                else:
                    # Still process buffer but don't send immediately for very rapid tokens
                    self._process_buffer()
            
            def _process_buffer(self):
                """Process the buffer for thinking tags and content."""
                while True:
                    if not self.in_thinking and '<think>' in self.buffer:
                        # Found start of thinking section
                        idx = self.buffer.index('<think>')
                        if idx > 0:
                            # Send content before thinking tag
                            pre_think = self.buffer[:idx]
                            if pre_think:
                                self.event_queue.put({
                                    'type': 'content',
                                    'message_id': self.message_id,
                                    'chunk': pre_think
                                })
                        
                        # Send thinking start event
                        self.event_queue.put({
                            'type': 'thinking_start',
                            'message_id': self.message_id
                        })
                        self.in_thinking = True
                        self.buffer = self.buffer[idx + 7:]  # Remove '<think>'
                        
                    elif self.in_thinking and '</think>' in self.buffer:
                        # Found end of thinking section
                        idx = self.buffer.index('</think>')
                        if idx > 0:
                            # Send thinking content
                            thinking_content = self.buffer[:idx]
                            if thinking_content:
                                self.event_queue.put({
                                    'type': 'content',
                                    'message_id': self.message_id,
                                    'chunk': thinking_content
                                })
                        
                        # Send thinking end event
                        self.event_queue.put({
                            'type': 'thinking_end',
                            'message_id': self.message_id
                        })
                        self.in_thinking = False
                        self.buffer = self.buffer[idx + 8:]  # Remove '</think>'
                        
                    else:
                        # No complete tags found - send content chunks
                        # Send smaller chunks for better typewriter effect
                        if len(self.buffer) >= 3:  # Send every 3 characters for smooth streaming
                            print(f"[SSE] Sending small content chunk - length: {len(self.buffer)}, in_thinking: {self.in_thinking}")
                            self.event_queue.put({
                                'type': 'content',
                                'message_id': self.message_id,
                                'chunk': self.buffer
                            })
                            self.buffer = ""
                        break
            
            def on_llm_end(self, response: LLMResult, **kwargs) -> None:
                """Called when LLM finishes generating."""
                # Send any remaining buffer content
                if self.buffer:
                    self.event_queue.put({
                        'type': 'content',
                        'message_id': self.message_id,
                        'chunk': self.buffer
                    })
                    self.buffer = ""
                
                # Send completion event
                self.event_queue.put({
                    'type': 'stream_complete',
                    'message_id': self.message_id,
                    'full_content': self.full_content
                })
                
                # Signal end of stream
                self.event_queue.put(None)
            
            def on_llm_error(self, error: Exception, **kwargs) -> None:
                """Called when LLM encounters an error."""
                self.event_queue.put({
                    'type': 'error',
                    'message_id': self.message_id,
                    'error': str(error)
                })
                # Signal end of stream
                self.event_queue.put(None)
        
        def generate() -> Generator[str, None, None]:
            """Generator that yields SSE events in real-time."""
            try:
                # Initialize Ollama LLM for this request
                llm = OllamaLLM(
                    base_url=self.ollama_host,
                    model=self.model,
                    temperature=0.7,
                    top_p=0.9,
                    top_k=40,
                    num_predict=2048
                )
                
                # Create callback
                callback = RealTimeSSECallback(message_id, event_queue)
                
                # Start LLM generation in a separate thread
                def run_llm():
                    try:
                        # Use the raw prompt - no enhancement needed
                        # Use config dict to pass callbacks (LangChain v0.1+ syntax)
                        from langchain_core.runnables import RunnableConfig
                        config = RunnableConfig(callbacks=[callback])
                        llm.invoke(prompt, config=config)
                    except Exception as e:
                        print(f"LLM error: {e}")
                        event_queue.put({
                            'type': 'error',
                            'message_id': message_id,
                            'error': str(e)
                        })
                        event_queue.put(None)
                
                llm_thread = threading.Thread(target=run_llm)
                llm_thread.start()
                
                # Stream events as they arrive
                while True:
                    try:
                        # Wait for events with timeout
                        event = event_queue.get(timeout=30)
                        
                        if event is None:
                            # End of stream signal
                            break
                        
                        # Send SSE event immediately
                        yield self._format_sse(event)
                        
                    except queue.Empty:
                        # Timeout - send a keep-alive comment
                        yield ": keep-alive\n\n"
                        continue
                
                # Ensure thread completes
                llm_thread.join(timeout=5)
                
                # Send final newline to ensure proper closure
                yield '\n'
                
            except Exception as e:
                print(f"Error in SSE generator: {e}")
                error_event = {
                    'type': 'error',
                    'message_id': message_id,
                    'error': f"Stream error: {str(e)}"
                }
                yield self._format_sse(error_event)
            
            finally:
                # Cleanup
                if message_id in self.active_streams:
                    del self.active_streams[message_id]
        
        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            }
        )
    
    def get_stream_status(self, message_id: str) -> Dict[str, Any]:
        """Get status of active stream."""
        if message_id in self.active_streams:
            stream_info = self.active_streams[message_id]
            return {
                'active': True,
                'duration': time.time() - stream_info['start_time'],
                'content_length': len(stream_info.get('content', ''))
            }
        return {'active': False}
    
    def stop_stream(self, message_id: str) -> bool:
        """Stop an active stream."""
        if message_id in self.active_streams:
            # Put None to signal end of stream
            if 'queue' in self.active_streams[message_id]:
                self.active_streams[message_id]['queue'].put(None)
            del self.active_streams[message_id]
            return True
        return False
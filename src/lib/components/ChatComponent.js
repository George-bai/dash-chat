/**
 * Example Usage:
 * ```
 * <ChatComponent
 *     id="chat"
 *     messages={[
 *         { role: "assistant", content: "Hello! How can I assist you today?" }
 *     ]}
 *     typing_indicator="dots"
 *     theme="dark"
 *     custom_styles={{ backgroundColor: "#222", color: "#fff" }}
 *     is_typing={{ user: false, assistant: true }}
 * />
 * ```
*/

import React, { useEffect, useRef, useState, useCallback } from "react";
import { EllipsisVertical } from "lucide-react";
import PropTypes from "prop-types";
import ReactMarkdown from 'react-markdown';

import MessageInput from "../../private/ChatMessageInput";
import renderMessageContent from "../../private/renderers";
import TypingIndicatorDots from "../../private/DotsIndicator";
import TypingIndicatorSpinner from "../../private/SpinnerIndicator";

import "../../styles/chatStyles.css";

// Helper function to format timestamp
const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Timestamp component
const MessageTimestamp = ({ message, isStreaming }) => {
    const time = formatTimestamp(message.timestamp);
    const role = message.role === 'user' ? 'You' : 'Assistant';
    const status = isStreaming ? '(responding...)' : '';
    
    return (
        <div className="message-timestamp">
            <span className="message-sender">{role}</span>
            <span className="message-time">{time} {status}</span>
        </div>
    );
};

// Typewriter effect hook
const useTypewriter = (text, speed = 30, enabled = true) => {
    const [displayText, setDisplayText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const indexRef = useRef(0);
    const rafRef = useRef(null);
    const lastTimeRef = useRef(0);
    
    useEffect(() => {
        if (!enabled || !text) {
            setDisplayText(text);
            setIsTyping(false);
            return;
        }
        
        // Reset if text is shorter than current display
        if (text.length < displayText.length) {
            indexRef.current = 0;
            setDisplayText('');
        }
        
        // Start typing animation
        setIsTyping(true);
        
        const typeText = (timestamp) => {
            if (timestamp - lastTimeRef.current >= speed) {
                if (indexRef.current < text.length) {
                    const newText = text.slice(0, indexRef.current + 1);
                    setDisplayText(newText);
                    indexRef.current++;
                    lastTimeRef.current = timestamp;
                }
            }
            
            if (indexRef.current < text.length) {
                rafRef.current = requestAnimationFrame(typeText);
            } else {
                setIsTyping(false);
            }
        };
        
        rafRef.current = requestAnimationFrame(typeText);
        
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [text, speed, enabled]);
    
    return { displayText, isTyping };
};

// Parse thinking tags from streaming content
const parseThinkingContent = (content) => {
    const thinkingSections = [];
    let mainContent = '';
    let currentThinking = null;
    let mainContentStarted = false;
    
    // Process content character by character to handle tags properly
    let i = 0;
    while (i < content.length) {
        if (content.substr(i, 7) === '<think>') {
            // Start thinking section
            currentThinking = {
                id: `thinking-${thinkingSections.length}`,
                content: '',
                isComplete: false
            };
            i += 7; // Skip '<think>'
        } else if (content.substr(i, 8) === '</think>') {
            // End thinking section
            if (currentThinking) {
                currentThinking.isComplete = true;
                thinkingSections.push(currentThinking);
                currentThinking = null;
            }
            mainContentStarted = true;
            i += 8; // Skip '</think>'
        } else {
            // Add character to appropriate content
            if (currentThinking !== null) {
                currentThinking.content += content[i];
            } else if (mainContentStarted || thinkingSections.length === 0) {
                mainContent += content[i];
            }
            i++;
        }
    }
    
    // Handle incomplete thinking section
    if (currentThinking) {
        thinkingSections.push(currentThinking);
    }
    
    return {
        thinkingSections,
        mainContent: mainContent.trim()
    };
};

// Thinking section component with typewriter effect
const ThinkingSection = ({ thinking, isExpanded, onToggle, isStreaming, typewriterSpeed = 30 }) => {
    const contentRef = useRef(null);
    const [height, setHeight] = useState(0);
    
    // Use typewriter effect when streaming and thinking is not complete
    const shouldUseTypewriter = isStreaming && !thinking.isComplete && isExpanded;
    
    const { displayText, isTyping } = useTypewriter(
        thinking.content, 
        typewriterSpeed, 
        shouldUseTypewriter
    );
    
    // Use typewriter text when streaming, full text when complete
    const contentToShow = isStreaming ? displayText : thinking.content;
    
    useEffect(() => {
        if (contentRef.current) {
            setHeight(contentRef.current.scrollHeight);
        }
    }, [contentToShow]);
    
    return (
        <div className={`thinking-section ${isStreaming ? 'streaming' : ''}`}>
            <button 
                className="thinking-toggle"
                onClick={onToggle}
                disabled={isStreaming}
            >
                <span className="thinking-chevron" style={{
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                }}>▶</span>
                <span className="thinking-label">
                    {isStreaming ? 'Thinking...' : 'Thinking process'}
                </span>
            </button>
            <div 
                className="thinking-content-wrapper"
                style={{
                    height: isExpanded ? height : 0,
                    opacity: isExpanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: isStreaming ? 'none' : 'all 0.3s ease-in-out'
                }}
            >
                <div ref={contentRef} className="thinking-content">
                    <ReactMarkdown>{contentToShow}</ReactMarkdown>
                    {isTyping && <span className="typewriter-cursor">▊</span>}
                </div>
            </div>
        </div>
    );
};

// Streaming message component with think tag parsing
const StreamingMessage = ({ 
    message, 
    isStreaming, 
    bubbleStyle, 
    showThinkingProcess, 
    thinkingAutoCollapse, 
    thinkingCollapseDelay, 
    typewriterSpeed 
}) => {
    const [expandedThinking, setExpandedThinking] = useState({});
    const parseStateRef = useRef({ inThinking: false });
    
    let thinkingSections = [];
    let mainContent = '';
    
    if (isStreaming) {
        // Use separate content streams during streaming
        const thinkingContent = message.streamingThinkingContent || '';
        mainContent = message.streamingMainContent || '';
        
        // Create thinking section if we have thinking content
        if (thinkingContent) {
            thinkingSections = [{
                id: `thinking-streaming-${message.id}`,
                content: thinkingContent,
                isComplete: !message.inThinkingMode
            }];
        }
    } else {
        // Use parsed content for completed messages
        const content = message.content || '';
        const parsed = parseThinkingContent(content);
        thinkingSections = parsed.thinkingSections;
        mainContent = parsed.mainContent;
    }
    
    // Auto-expand thinking sections while streaming
    useEffect(() => {
        if (isStreaming && thinkingSections.length > 0) {
            console.log('[StreamingMessage] Auto-expanding thinking sections');
            const newExpanded = {};
            thinkingSections.forEach(thinking => {
                newExpanded[thinking.id] = true;
            });
            setExpandedThinking(newExpanded);
        }
    }, [isStreaming, thinkingSections.length]);
    
    // Auto-collapse completed thinking sections
    useEffect(() => {
        if (thinkingAutoCollapse && thinkingSections.length > 0) {
            const timers = [];
            
            thinkingSections.forEach(thinking => {
                if (thinking.isComplete && expandedThinking[thinking.id] !== false) {
                    const timer = setTimeout(() => {
                        setExpandedThinking(prev => ({
                            ...prev,
                            [thinking.id]: false
                        }));
                    }, thinkingCollapseDelay);
                    
                    timers.push(timer);
                }
            });
            
            return () => {
                timers.forEach(timer => clearTimeout(timer));
            };
        }
    }, [thinkingSections.map(t => `${t.id}-${t.isComplete}`).join(','), thinkingAutoCollapse, thinkingCollapseDelay]);
    
    const toggleThinking = (thinkId) => {
        setExpandedThinking(prev => ({
            ...prev,
            [thinkId]: !prev[thinkId]
        }));
    };
    
    return (
        <div className={`chat-bubble ${message.role}`} style={bubbleStyle}>
            <MessageTimestamp message={message} isStreaming={isStreaming} />
            {showThinkingProcess && thinkingSections.map((thinking) => (
                <ThinkingSection
                    key={thinking.id}
                    thinking={thinking}
                    isExpanded={expandedThinking[thinking.id]}
                    onToggle={() => toggleThinking(thinking.id)}
                    isStreaming={!thinking.isComplete}
                    typewriterSpeed={typewriterSpeed}
                />
            ))}
            {mainContent && (
                <div className="markdown-content">
                    <ReactMarkdown>{mainContent}</ReactMarkdown>
                </div>
            )}
            {isStreaming && !parseStateRef.current.inThinking && !mainContent && (
                <TypingIndicatorDots />
            )}
        </div>
    );
};

const defaultUserBubbleStyle = {
    backgroundColor: "#007bff",
    color: "white",
    marginLeft: "auto",
    textAlign: "right",
};

const defaultAssistantBubbleStyle = {
    backgroundColor: "#f1f0f0",
    color: "black",
    marginRight: "auto",
    textAlign: "left",
};

/**
 * ChatComponent - A React-based chat interface with customizable styles and typing indicators.
 * * This component provides a chat interface with support for:
 * - Displaying messages exchanged between 2 users typically a user and an assistant.
 * - Customizable themes and styles for the chat UI.
 * - Typing indicators for both the user and assistant.
 * - Integration with Dash via the `setProps` callback for state management.
*/

const ChatComponent = ({
    /**
     * allowing snake_case to support Python's naming convention
     * except for setProps which is automatically set by dash and
     * it's expected to be named in the camelCase format.
     * https://dash.plotly.com/react-for-python-developers
    */
    id,
    messages = [],
    theme = "light",
    container_style: containerStyle = null,
    typing_indicator: typingIndicator = "dots",
    input_container_style: inputContainerStyle = null,
    input_text_style: inputTextStyle = null,
    setProps = () => {},
    fill_height: fillHeight = true,
    fill_width: fillWidth = true,
    user_bubble_style: userBubbleStyleProp = {},
    assistant_bubble_style: assistantBubbleStyleProp = {},
    input_placeholder: inputPlaceholder = "",
    class_name: className = "",
    persistence = false,
    persistence_type: persistenceType = "local",
    supported_input_file_types : accept = "*/*",
    // New SSE streaming props
    streaming_enabled: streamingEnabled = false,
    sse_endpoint: sseEndpoint = null,
    show_thinking_process: showThinkingProcess = true,
    thinking_auto_collapse: thinkingAutoCollapse = true,
    thinking_collapse_delay: thinkingCollapseDelay = 300,
    typewriter_speed: typewriterSpeed = 30,
}) => {
    const userBubbleStyle = { ...defaultUserBubbleStyle, ...userBubbleStyleProp };
    const assistantBubbleStyle = { ...defaultAssistantBubbleStyle, ...assistantBubbleStyleProp };
    const [currentMessage, setCurrentMessage] = useState("");
    const [attachment, setAttachment] = useState("");
    const [localMessages, setLocalMessages] = useState([]);
    const [showTyping, setShowTyping] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const messageEndRef = useRef(null);
    const dropdownRef = useRef(null);
    
    // New SSE state
    const [streamingMessages, setStreamingMessages] = useState({});
    const [isStreaming, setIsStreaming] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const sseRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    
    // Debug: Track isStreaming changes
    useEffect(() => {
        console.log('isStreaming state changed to:', isStreaming);
    }, [isStreaming]);

    let storeType;
    if (persistenceType === "local") {
        storeType = "localStorage";
    } else if (persistenceType === "local") {
        storeType = "sessionStorage";
    }

    // Initialize messages from storage or props (only run once)
    const initializedRef = useRef(false);
    useEffect(() => {
        if (!initializedRef.current) {
            if (persistence) {
                const savedMessages = JSON.parse(window[storeType].getItem(id)) || [];
                const initialized = JSON.parse(window[storeType].getItem(`${id}-initialized`));
                if (savedMessages.length > 0) {
                    setLocalMessages(savedMessages);
                } else if (!initialized && messages.length > 0) {
                    setLocalMessages(messages);
                    window[storeType].setItem(id, JSON.stringify(messages));
                    window[storeType].setItem(`${id}-initialized`, "true");
                }
            } else {
                setLocalMessages(messages);
            }
            initializedRef.current = true;
        }
    }, [id, persistence, storeType]);

    // persist messages whenever localMessages updates
    useEffect(() => {
        if (persistence && localMessages.length > 0) {
            window[storeType].setItem(id, JSON.stringify(localMessages));
        }
    }, [localMessages, id, persistence, storeType]);

    // hide typing indicator & handle new messages (only add user messages, SSE handles assistant messages)
    useEffect(() => {
        if (messages.length > 0) {
            const lastMsg = messages.slice(-1).pop();
            if (lastMsg?.role === "assistant") {
                // Assistant messages are handled by SSE, just hide typing indicator
                setShowTyping(false);
            } else if (lastMsg?.role === "user") {
                // Add user messages to local messages
                setLocalMessages(prev => {
                    // Check if this user message already exists
                    const messageExists = prev.some(msg => msg.id === lastMsg.id);
                    return messageExists ? prev : [...prev, lastMsg];
                });
            }
        }
    }, [messages]);

    useEffect(() => {
        if (messageEndRef.current) {
            messageEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [localMessages]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    
    // Initialize SSE connection
    useEffect(() => {
        if (streamingEnabled && sseEndpoint) {
            // Close existing connection first
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
            
            // Only create new connection if endpoint has actual prompt with content
            if (sseEndpoint.includes('prompt=') && !sseEndpoint.endsWith('prompt=')) {
                const urlParams = new URLSearchParams(sseEndpoint.split('?')[1] || '');
                const prompt = urlParams.get('prompt');
                const messageId = urlParams.get('message_id');
                
                if (prompt && prompt.trim() !== '' && messageId) {
                    console.log('Creating new SSE connection for message:', messageId);
                    connectSSE();
                } else {
                    console.log('Skipping SSE connection - invalid prompt or message_id');
                }
            }
        }
        
        return () => {
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [streamingEnabled, sseEndpoint]);
    
    const connectSSE = () => {
        if (!sseEndpoint) return;
        
        const eventSource = new EventSource(sseEndpoint);
        const completedMessages = new Set();
        let connectionClosed = false;
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Track when messages complete normally
                if (data.type === 'stream_complete') {
                    completedMessages.add(data.message_id);
                    connectionClosed = true; // Mark that we expect the connection to close
                }
                handleSSEMessage(data);
            } catch (e) {
                console.error('SSE parse error:', e);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('SSE error:', error, 'ReadyState:', eventSource.readyState);
            
            // If we received a stream_complete event, this is normal closure
            if (connectionClosed) {
                console.log('SSE connection closed normally after completion');
                eventSource.close();
                return;
            }
            
            // Only handle as error if connection is actually broken (not normal completion)
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('SSE connection closed (may be normal)');
                return;
            }
            
            console.log('Actual SSE connection error detected');
            setConnectionError('Connection lost. Please try again.');
            
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
            
            // Only replace messages that are actually incomplete (still streaming and not completed)
            setStreamingMessages(prev => {
                const incompleteMessages = Object.keys(prev).filter(
                    messageId => !completedMessages.has(messageId)
                );
                
                if (incompleteMessages.length > 0) {
                    console.log('Replacing incomplete streaming messages with error:', incompleteMessages);
                    incompleteMessages.forEach(messageId => {
                        const errorMessage = {
                            ...prev[messageId],
                            content: 'Connection error occurred. Please try again.',
                            isStreaming: false,
                            completedAt: Date.now()
                        };
                        setLocalMessages(prevLocal => [...prevLocal, errorMessage]);
                    });
                    setIsStreaming(false);
                    return {};
                } else {
                    console.log('No incomplete messages to replace');
                    return prev;
                }
            });
        };
        
        eventSource.onopen = () => {
            console.log('SSE connection opened');
        };
        
        sseRef.current = eventSource;
    };
    
    // Handle SSE messages
    const handleSSEMessage = useCallback((data) => {
        console.log('SSE message received:', data.type, data.message_id);
        switch (data.type) {
            case 'stream_start':
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        id: data.message_id,
                        role: data.role || 'assistant',
                        content: '',
                        streamingContent: '',
                        streamingThinkingContent: '',
                        streamingMainContent: '',
                        inThinkingMode: false,
                        isStreaming: true,
                        timestamp: Date.now()
                    }
                }));
                setIsStreaming(true);
                setShowTyping(false);
                break;
                
            case 'content':
                console.log('[SSE content] Chunk received - length:', data.chunk?.length || 0, 'preview:', data.chunk?.substring(0, 50));
                setStreamingMessages(prev => {
                    const existingMessage = prev[data.message_id];
                    if (!existingMessage) {
                        console.log('[SSE content] Creating new message for chunk');
                        // Create message if it doesn't exist yet
                        return {
                            ...prev,
                            [data.message_id]: {
                                id: data.message_id,
                                role: 'assistant',
                                content: '',
                                streamingContent: data.chunk || '',
                                streamingThinkingContent: '',
                                streamingMainContent: data.chunk || '',
                                inThinkingMode: false,
                                isStreaming: true
                            }
                        };
                    }
                    
                    const chunk = data.chunk || '';
                    const inThinking = existingMessage.inThinkingMode;
                    console.log('[SSE content] Routing chunk to:', inThinking ? 'thinking' : 'main', 'content');
                    
                    return {
                        ...prev,
                        [data.message_id]: {
                            ...existingMessage,
                            streamingContent: (existingMessage.streamingContent || '') + chunk,
                            streamingThinkingContent: inThinking 
                                ? (existingMessage.streamingThinkingContent || '') + chunk
                                : existingMessage.streamingThinkingContent || '',
                            streamingMainContent: !inThinking
                                ? (existingMessage.streamingMainContent || '') + chunk
                                : existingMessage.streamingMainContent || ''
                        }
                    };
                });
                break;
                
            case 'thinking_start':
                console.log('[SSE thinking_start] Entering thinking mode for message:', data.message_id);
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        ...prev[data.message_id],
                        inThinkingMode: true
                    }
                }));
                break;
                
            case 'thinking_end':
                console.log('[SSE thinking_end] Exiting thinking mode for message:', data.message_id);
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        ...prev[data.message_id],
                        inThinkingMode: false
                    }
                }));
                break;
                
            case 'stream_complete':
                console.log('Stream complete received for message:', data.message_id);
                // Use functional updates to avoid stale closure issues
                setStreamingMessages(prev => {
                    const streamingMessage = prev[data.message_id];
                    if (streamingMessage) {
                        const completedMessage = {
                            id: data.message_id,
                            role: streamingMessage.role || 'assistant',
                            content: data.full_content || streamingMessage.streamingContent || '',
                            isStreaming: false,
                            timestamp: streamingMessage.timestamp,
                            completedAt: Date.now()
                        };
                        
                        console.log('Moving message to completed:', completedMessage.id, 'isStreaming:', completedMessage.isStreaming);
                        
                        // Move to local messages
                        setLocalMessages(prevLocal => [...prevLocal, completedMessage]);
                        
                        // Log the state for debugging
                        const newStreaming = { ...prev };
                        delete newStreaming[data.message_id];
                        console.log('Streaming messages after removal:', Object.keys(newStreaming));
                        
                        return newStreaming;
                    }
                    return prev;
                });
                
                // Always set streaming to false when we receive stream_complete for any message
                console.log('Setting isStreaming to false due to stream_complete');
                setIsStreaming(false);
                
                // Close the SSE connection since the stream is complete
                if (sseRef.current) {
                    sseRef.current.close();
                    sseRef.current = null;
                }
                
                // Only notify parent of completion, don't update messages prop to avoid callback loops
                if (setProps) {
                    setProps({ 
                        streaming_complete: data.message_id 
                    });
                }
                break;
                
            case 'error':
                console.error('SSE stream error:', data.error);
                // Remove failed message from streaming
                setStreamingMessages(prev => {
                    const newStreaming = { ...prev };
                    delete newStreaming[data.message_id];
                    return newStreaming;
                });
                setShowTyping(false);
                break;
        }
    }, [setProps]);


    const handleInputChange = (e) => {
        setCurrentMessage(e.target.value);
    };

    const convertFileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleSendMessage = async () => {
        if (currentMessage.trim() || attachment) {
            let content;

            if (attachment) {
                const base64File = await convertFileToBase64(attachment);
                content = [
                    { type: "text", text: currentMessage.trim() },
                    {
                        type: "attachment",
                        file: base64File,
                        fileName: attachment.name,
                        fileType: attachment.type
                    },
                ];
            } else {
                content = currentMessage.trim();
            }

            const newMessage = { 
                role: "user", 
                content, 
                id: Date.now(),
                timestamp: Date.now()
            };
            setLocalMessages((prevMessages) => {
                const updatedMessages = [...prevMessages, newMessage];
                if (persistence) {
                    window[storeType].setItem(id, JSON.stringify(updatedMessages));
                }
                return updatedMessages;
            });

            if (setProps) {
                setProps({ new_message: newMessage });
            }

            // Only show typing indicator if not using SSE streaming
            if (!streamingEnabled) {
                setShowTyping(true);
            }
            setCurrentMessage("");
            setAttachment("");
        }
    };

    const handleClearChat = () => {
        setLocalMessages([]);
        if (persistence) {
            window[storeType].removeItem(id);
        }
        setDropdownOpen(false);
    };

    const handleStopStreaming = () => {
        if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
        }
        
        // Replace any incomplete streaming messages with stop message
        setStreamingMessages(prev => {
            Object.keys(prev).forEach(messageId => {
                const stoppedMessage = {
                    ...prev[messageId],
                    content: 'Response stopped by user.',
                    isStreaming: false,
                    completedAt: Date.now()
                };
                setLocalMessages(prevLocal => [...prevLocal, stoppedMessage]);
            });
            return {};
        });
        
        setIsStreaming(false);
        setConnectionError(null);
    };

    const styleChatContainer = {};
    const inputFieldStyle = {};
    if (fillHeight) {
        styleChatContainer.height = "100%";
    } else {
        styleChatContainer.height = "50%";
    }
    if (fillWidth) {
        styleChatContainer.width = "auto";
    } else {
        styleChatContainer.width = "50%";
    }
    if (theme === "dark") {
        styleChatContainer.backgroundColor = "#161618";
        styleChatContainer.borderColor = "#444444";
        styleChatContainer.color = "#ffffff";
        inputFieldStyle.borderColor = "#f1f0f0";
        inputFieldStyle.color = "#000000";
    } else {
        styleChatContainer.backgroundColor = "#ffffff";
        styleChatContainer.borderColor = "#e0e0e0";
        styleChatContainer.color = "#e0e0e0";
        inputFieldStyle.borderColor = "#e0e0e0";
    }
    
    // Render all messages (both completed and streaming) in chronological order
    const renderMessages = () => {
        const allMessages = [
            ...localMessages,
            ...Object.values(streamingMessages)
        ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        return allMessages.map((message, index) => {
            // Validate message object
            if (!message || typeof message !== "object") {
                return null;
            }
            
            // Ensure required properties exist
            if (!message.role || (!message.content && !message.streamingContent)) {
                return null;
            }
            
            const bubbleStyle = message.role === "user" ? userBubbleStyle : assistantBubbleStyle;
            const isStreaming = message.isStreaming || false;
            
            // Use StreamingMessage for streaming messages or messages with thinking content
            if (isStreaming || message.streamingThinkingContent || (message.content && message.content.includes('<think>'))) {
                return (
                    <StreamingMessage
                        key={message.id || index}
                        message={message}
                        isStreaming={isStreaming}
                        bubbleStyle={bubbleStyle}
                        showThinkingProcess={showThinkingProcess}
                        thinkingAutoCollapse={thinkingAutoCollapse}
                        thinkingCollapseDelay={thinkingCollapseDelay}
                        typewriterSpeed={typewriterSpeed}
                    />
                );
            }
            
            // Regular message rendering
            return (
                <div key={index} className={`chat-bubble ${message.role}`} style={bubbleStyle}>
                    <MessageTimestamp message={message} isStreaming={false} />
                    <div className="markdown-content">
                        {renderMessageContent(message.content)}
                    </div>
                </div>
            );
        });
    }

    return (
        <div className={`chat-container ${className}`} style={{ ...styleChatContainer, ...containerStyle }}>
            {persistence && (
                <div className="actionBtnContainer" ref={dropdownRef}>
                    <div className="dropdown">
                        <button className="dotsButton" onClick={() => setDropdownOpen(!dropdownOpen)} aria-label="clear">
                            <EllipsisVertical size={24} />
                        </button>
                        {dropdownOpen && (
                            <div className="dropdownMenu">
                                <button onClick={handleClearChat} className="dropdownItem">
                                    Clear chat
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className="chat-messages">
                {localMessages.length === 0 && Object.keys(streamingMessages).length === 0 ? (
                    <div className="empty-chat">No conversation yet.</div>
                ) : (
                    renderMessages()
                )}
                {showTyping && (
                    <div className="typing-indicator user-typing" data-testid="typing-indicator">
                        {typingIndicator === "dots" && <TypingIndicatorDots />}
                        {typingIndicator === "spinner" && <TypingIndicatorSpinner />}
                    </div>
                )}
                <div ref={messageEndRef} />
            </div>
            <div className="chat-input">
                <MessageInput
                    onSend={handleSendMessage}
                    onStop={handleStopStreaming}
                    handleInputChange={handleInputChange}
                    value={currentMessage}
                    customStyles={inputContainerStyle}
                    inputComponentStyles={{ ...inputFieldStyle, ...inputTextStyle }}
                    placeholder={inputPlaceholder}
                    showTyping={showTyping}
                    isStreaming={isStreaming}
                    setAttachment={setAttachment}
                    accept={accept}
                />
            </div>
        </div>
    );
};

ChatComponent.propTypes = {
    /**
     * The ID of this component, used to identify dash components
     * in callbacks. The ID needs to be unique across all of the
     * components in an app.
    */
    id: PropTypes.string,
    /**
     * An array of options. The list of chat messages. Each message object should have:
     *    - `role` (string): The message sender, either "user" or "assistant".
     *    - `content`: The content of the message.
    */
    messages: PropTypes.arrayOf(
        PropTypes.shape({
            role: PropTypes.oneOf(["user", "assistant"]).isRequired,
            content: PropTypes.oneOfType([
                PropTypes.arrayOf(
                    PropTypes.oneOf(
                        PropTypes.shape({
                            type: PropTypes.oneOf(["text", "attachment", "table", "graph"]).isRequired,
                            props: PropTypes.object,
                        }),
                        PropTypes.object
                    )
                ),
                PropTypes.string,
                PropTypes.object,
            ]).isRequired,
        })
    ),
    /**
     * Dash-assigned callback that gets fired when the value for messages and isTyping changes.
    */
    setProps: PropTypes.func,
    /**
     * Theme for the chat interface. Default is "light". Use "dark" for a dark mode appearance.
    */
    theme: PropTypes.string,
    /**
     * Inline css styles to customize the chat container.
    */
    container_style: PropTypes.object,
    /**
     * The type of typing indicator to display. Options are:
     *    - `"dots"`: Displays animated dots.
     *    - `"spinner"`: Displays a spinner animation.
    */
    typing_indicator: PropTypes.oneOf(["dots", "spinner"]),
    /**
     * Latest chat message that was appended to messages array.
    */
    new_message: PropTypes.object,
    /**
     * Inline styles for the container holding the message input field.
    */
    input_container_style: PropTypes.object,
    /**
     * Inline styles for the message input field itself.
    */
    input_text_style: PropTypes.object,
    /**
     *  Whether to vertically fill the screen with the chat container. If False, centers and constrains container to a maximum height.
    */
    fill_height: PropTypes.bool,
    /**
     * Whether to horizontally fill the screen with the chat container. If False, centers and constrains container to a maximum width.
    */
    fill_width: PropTypes.bool,
    /**
     * Css styles to customize the user message bubble.
    */
    user_bubble_style: PropTypes.object,
    /**
     * Css styles to customize the assistant message bubble.
    */
    assistant_bubble_style: PropTypes.object,
    /**
     * Placeholder input to bne used in the input field
    */
    input_placeholder: PropTypes.string,
    /**
     * Name for the class attribute to be added to the chat container
    */
    class_name: PropTypes.string,
    /**
     * Whether messages should be stored for persistence
    */
    persistence: PropTypes.bool,
    /**
     * Where persisted messages will be stored
    */
    persistence_type: PropTypes.oneOf(["local", "session"]),
    /**
     * String or array of file types to accept in the attachment file input
    */
    supported_input_file_types: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.arrayOf(PropTypes.string),
    ]),
    
    /**
     * Enable SSE streaming functionality
     */
    streaming_enabled: PropTypes.bool,
    
    /**
     * SSE endpoint URL for streaming messages
     */
    sse_endpoint: PropTypes.string,
    
    /**
     * Show thinking process sections
     */
    show_thinking_process: PropTypes.bool,
    
    /**
     * Auto-collapse thinking sections when complete
     */
    thinking_auto_collapse: PropTypes.bool,
    
    /**
     * Delay before auto-collapsing thinking sections (ms)
     */
    thinking_collapse_delay: PropTypes.number,
    
    /**
     * Speed of typewriter effect for thinking content (ms per character)
     */
    typewriter_speed: PropTypes.number,
    
    /**
     * Fired when streaming completes for a message
     */
    streaming_complete: PropTypes.string,
};

export default ChatComponent;

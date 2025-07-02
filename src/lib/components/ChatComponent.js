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
import remarkGfm from 'remark-gfm';

import MessageInput from "../../private/ChatMessageInput";
import renderMessageContent from "../../private/renderers";
import TypingIndicatorDots from "../../private/DotsIndicator";
import TypingIndicatorSpinner from "../../private/SpinnerIndicator";

import "../../styles/chatStyles.css";

// Helper function to format timestamp with full date
const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString([], { 
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
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


// Parse thinking tags from streaming content
const parseThinkingContent = (content, messageId = 'default') => {
    const thinkingSections = [];
    let mainContent = '';
    let currentThinking = null;
    let mainContentStarted = false;
    
    // Process content character by character to handle tags properly
    let i = 0;
    while (i < content.length) {
        if (content.substr(i, 7) === '<think>') {
            // Start thinking section with stable ID based on message ID and position
            currentThinking = {
                id: `thinking-${messageId}-${thinkingSections.length}`,
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

// Thinking section component
const ThinkingSection = ({ thinking, isExpanded, onToggle, isStreaming }) => {
    const contentRef = useRef(null);
    const [height, setHeight] = useState(0);
    
    
    // Always show the full content
    const contentToShow = thinking.content;
    
    useEffect(() => {
        if (contentRef.current) {
            // Small delay to ensure ReactMarkdown has rendered
            const timer = setTimeout(() => {
                const newHeight = contentRef.current.scrollHeight;
                setHeight(newHeight);
            }, 50);
            
            return () => clearTimeout(timer);
        }
    }, [contentToShow, thinking.id, isExpanded]);
    
    return (
        <div className={`thinking-section ${isStreaming ? 'streaming' : ''}`}>
            <button 
                className="thinking-toggle"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle();
                }}
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
                    height: isExpanded ? (height > 0 ? `${height}px` : 'auto') : '0px',
                    opacity: isExpanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: isStreaming ? 'none' : 'all 0.3s ease-in-out'
                }}
            >
                <div ref={contentRef} className="thinking-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentToShow}</ReactMarkdown>
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
    thinkingCollapseDelay
}) => {
    // Fix: Use message ID in the initial state to make it stable  
    const [expandedThinking, setExpandedThinking] = useState({});
    
    // Track if this message was ever streaming during this component's lifecycle
    const wasEverStreamingRef = useRef(isStreaming);
    if (isStreaming) {
        wasEverStreamingRef.current = true;
    }
    
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
        const parsed = parseThinkingContent(content, message.id);
        thinkingSections = parsed.thinkingSections;
        mainContent = parsed.mainContent;
    }
    
    // Load thinking states from session storage and auto-expand during streaming
    useEffect(() => {
        if (thinkingSections.length > 0) {
            const newExpanded = {};
            
            thinkingSections.forEach(thinking => {
                if (isStreaming) {
                    // Auto-expand during streaming
                    newExpanded[thinking.id] = true;
                } else {
                    // Load from session storage for historical messages
                    try {
                        const stored = sessionStorage.getItem(`thinking-state-${thinking.id}`);
                        const savedState = stored ? JSON.parse(stored) : false;
                        newExpanded[thinking.id] = savedState;
                    } catch (e) {
                        newExpanded[thinking.id] = false;
                    }
                }
            });
            
            setExpandedThinking(newExpanded);
        }
    }, [isStreaming, thinkingSections.map(t => t.id).join(',')]); // Depend on thinking IDs, not length
    
    // Auto-collapse completed thinking sections ONLY for streaming messages that just completed
    // Historical messages (already complete) should NOT auto-collapse
    useEffect(() => {
        
        // Only auto-collapse if this was a streaming message that just completed
        // Don't auto-collapse historical messages that are already complete
        if (thinkingAutoCollapse && thinkingSections.length > 0 && !isStreaming && wasEverStreamingRef.current) {
            const timers = [];
            
            thinkingSections.forEach(thinking => {
                // Only auto-collapse if:
                // 1. Thinking section is complete
                // 2. It's currently expanded (not already collapsed)
                // 3. This message was streaming at some point (not a historical message)
                if (thinking.isComplete && expandedThinking[thinking.id] === true) {
                    const timer = setTimeout(() => {
                        setExpandedThinking(prev => ({
                            ...prev,
                            [thinking.id]: false
                        }));
                    }, thinkingCollapseDelay);
                    
                    timers.push(timer);
                } else {
                }
            });
            
            return () => {
                timers.forEach(timer => clearTimeout(timer));
            };
        }
    }, [thinkingSections.map(t => `${t.id}-${t.isComplete}`).join(','), thinkingAutoCollapse, thinkingCollapseDelay, isStreaming, wasEverStreamingRef.current, message.id]);
    
    const toggleThinking = useCallback((thinkId) => {
        
        setExpandedThinking(prev => {
            const currentValue = prev[thinkId] || false;
            const newValue = !currentValue;
            const newState = {
                ...prev,
                [thinkId]: newValue
            };
            
            // Persist individual thinking state to session storage using thinkId as key
            try {
                sessionStorage.setItem(`thinking-state-${thinkId}`, JSON.stringify(newValue));
            } catch (e) {
            }
            
            return newState;
        });
    }, [message.id]); // Remove expandedThinking dependency to prevent excessive re-renders
    
    return (
        <div className={`chat-bubble ${message.role}`} style={bubbleStyle} data-message-id={message.id}>
            <MessageTimestamp message={message} isStreaming={isStreaming} />
            {showThinkingProcess && thinkingSections.map((thinking) => (
                <ThinkingSection
                    key={thinking.id}
                    thinking={thinking}
                    isExpanded={expandedThinking[thinking.id]}
                    onToggle={() => toggleThinking(thinking.id)}
                    isStreaming={!thinking.isComplete}
                />
            ))}
            {mainContent && (
                <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{mainContent}</ReactMarkdown>
                </div>
            )}
        </div>
    );
};

const defaultUserBubbleStyle = {
    backgroundColor: "#e2e8f0",
    color: "#1a202c",
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
    load_more_messages: loadMoreMessages = 0,
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
    const chatMessagesRef = useRef(null);
    
    // New SSE state
    const [streamingMessages, setStreamingMessages] = useState({});
    const [isStreaming, setIsStreaming] = useState(false);
    const sseRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    
    // Simple scrolling state
    const scrollTimeoutRef = useRef(null);

    let storeType;
    if (persistenceType === "local") {
        storeType = "localStorage";
    } else if (persistenceType === "session") {
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

    // Handle new messages from props (including historical messages from database)
    const previousScrollHeightRef = useRef(0);
    const previousFirstMessageIdRef = useRef(null);
    
    useEffect(() => {
        // Handle empty messages array - clear local messages when explicitly set to empty
        if (messages.length === 0) {
            setLocalMessages([]);
            setShowTyping(false);
            return;
        }
        
        if (messages.length > 0) {
            // Capture scroll position before updating messages
            const chatContainer = chatMessagesRef.current;
            const scrollTopBefore = chatContainer?.scrollTop || 0;
            const scrollHeightBefore = chatContainer?.scrollHeight || 0;
            const firstVisibleMessageId = localMessages.length > 0 ? localMessages[0].id : null;
            
            setLocalMessages(prev => {
                // Check if this is a complete flow switch by comparing message IDs
                const allMessageIdsMatch = prev.length > 0 && messages.length > 0 && 
                                         messages.every(msg => prev.some(prevMsg => prevMsg.id === msg.id));
                
                // For bulk updates (like historical loading), replace all messages
                // For single message updates, merge carefully
                if (messages.length >= 1 && prev.length === 0) {
                    // This looks like a historical message load or flow switch - replace all
                    return [...messages];
                } else if (messages.length >= 1 && !allMessageIdsMatch) {
                    // Different set of messages - this is a flow switch, replace all
                    return [...messages];
                } else if (messages.length >= 1) {
                    // Check if this is a historical load by comparing first message IDs
                    const isHistoricalLoad = prev.length > 0 && 
                                           messages.length > prev.length && 
                                           messages.some(msg => msg.id === prev[0].id) &&
                                           messages[0].id !== prev[0].id;
                    
                    if (isHistoricalLoad) {
                        isLoadingHistoricalRef.current = true;
                        
                        // Store the previous first message ID to find it after update
                        previousFirstMessageIdRef.current = prev[0].id;
                        previousScrollHeightRef.current = scrollHeightBefore;
                        
                        // Replace all messages with the new set (which includes prepended historical messages)
                        return [...messages];
                    } else {
                        // Handle single message updates or any message updates
                        
                        // Merge all messages from props that don't exist in local messages
                        const newMessages = [...prev];
                        let hasChanges = false;
                        
                        messages.forEach(msg => {
                            const messageExists = newMessages.some(existing => existing.id === msg.id);
                            if (!messageExists) {
                                newMessages.push(msg);
                                hasChanges = true;
                            }
                        });
                        
                        return hasChanges ? newMessages : prev;
                    }
                }
                
                return prev;
            });
            
            // Hide typing indicator for any new messages
            const lastMsg = messages.slice(-1).pop();
            if (lastMsg?.role === "assistant") {
                setShowTyping(false);
            }
        }
    }, [messages]);
    
    // Maintain scroll position after historical messages are loaded
    useEffect(() => {
        if (isLoadingHistoricalRef.current && previousFirstMessageIdRef.current && chatMessagesRef.current) {
            
            // Set programmatic scroll flag to prevent load more trigger
            isProgrammaticScrollRef.current = true;
            
            // Wait a bit for DOM to update
            setTimeout(() => {
                // Find the element that was previously at the top
                const messageElements = chatMessagesRef.current.querySelectorAll('[data-message-id]');
                let targetElement = null;
                
                for (const element of messageElements) {
                    if (element.getAttribute('data-message-id') === previousFirstMessageIdRef.current) {
                        targetElement = element;
                        break;
                    }
                }
                
                if (targetElement) {
                    // Calculate the new scroll position to keep the previous first message in view
                    const elementTop = targetElement.offsetTop;
                    const newScrollTop = elementTop - 50; // Small offset from top for better UX
                    
                    
                    chatMessagesRef.current.scrollTop = newScrollTop;
                } else {
                    // Fallback: maintain relative scroll position based on height difference
                    const scrollHeightAfter = chatMessagesRef.current.scrollHeight;
                    const heightDifference = scrollHeightAfter - previousScrollHeightRef.current;
                    
                    if (heightDifference > 0) {
                        
                        chatMessagesRef.current.scrollTop += heightDifference;
                    }
                }
                
                // Reset the flags after scroll adjustment
                setTimeout(() => {
                    isLoadingHistoricalRef.current = false;
                    previousFirstMessageIdRef.current = null;
                    previousScrollHeightRef.current = 0;
                    isProgrammaticScrollRef.current = false;
                }, 200);
            }, 50); // Small delay to ensure DOM is updated
        }
    }, [localMessages]);

    // Smart auto-scrolling: handle initial vs new messages differently
    const isInitialLoadRef = useRef(true);
    const lastMessageCountRef = useRef(0);
    const scrollToBottomTimeoutRef = useRef(null);
    const isLoadingHistoricalRef = useRef(false);
    
    useEffect(() => {
        
        if (messageEndRef.current && localMessages.length > 0) {
            const isNewMessage = localMessages.length > lastMessageCountRef.current;
            
            // Skip auto-scroll if we're loading historical messages
            if (isLoadingHistoricalRef.current) {
                lastMessageCountRef.current = localMessages.length;
                return;
            }
            
            // On initial load OR when genuinely new messages are added (not historical)
            if (isInitialLoadRef.current || (!isInitialLoadRef.current && isNewMessage)) {
                
                // Clear any existing scroll timeout
                if (scrollToBottomTimeoutRef.current) {
                    clearTimeout(scrollToBottomTimeoutRef.current);
                }
                
                // Set flag to prevent scroll detection during programmatic scroll
                isProgrammaticScrollRef.current = true;
                
                if (isInitialLoadRef.current) {
                    // For initial load, use a longer wait to ensure full DOM rendering
                    const scrollToBottomWhenReady = () => {
                        
                        if (chatMessagesRef.current && 
                            chatMessagesRef.current.scrollHeight > chatMessagesRef.current.clientHeight) {
                            
                            // Container has proper dimensions, scroll to bottom immediately
                            const maxScroll = chatMessagesRef.current.scrollHeight - chatMessagesRef.current.clientHeight;
                            chatMessagesRef.current.scrollTop = maxScroll;
                            
                            // Verify the scroll worked
                            setTimeout(() => {
                                
                                // Clear the programmatic scroll flag
                                isProgrammaticScrollRef.current = false;
                                isInitialLoadRef.current = false;
                            }, 100);
                        } else {
                            // Container still doesn't have proper dimensions, wait longer
                            
                            scrollToBottomTimeoutRef.current = setTimeout(scrollToBottomWhenReady, 100);
                        }
                    };
                    
                    // Start the scroll process with a reasonable delay
                    scrollToBottomTimeoutRef.current = setTimeout(scrollToBottomWhenReady, 200);
                } else {
                    // For new messages, use smooth scroll
                    messageEndRef.current.scrollIntoView({ behavior: "smooth" });
                    
                    // Clear flag after smooth scroll completes
                    setTimeout(() => {
                        isProgrammaticScrollRef.current = false;
                    }, 1000);
                }
            } else {
            }
            
            lastMessageCountRef.current = localMessages.length;
        }
    }, [localMessages]);
    
    // Always scroll to bottom when streaming (LLM is responding)
    useEffect(() => {
        if (isStreaming && messageEndRef.current) {
            // Set flag to prevent scroll detection during streaming scroll
            isProgrammaticScrollRef.current = true;
            
            // Scroll immediately during streaming
            messageEndRef.current.scrollIntoView({ behavior: "smooth" });
            
            // Clear flag after scroll completes
            setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, 1000);
        }
    }, [streamingMessages, isStreaming]);
    
    // Additional scroll trigger for streaming content changes
    const streamingContentLength = React.useMemo(() => {
        return Object.values(streamingMessages)
            .map(msg => (msg?.streamingContent || '').length + 
                       (msg?.streamingThinkingContent || '').length + 
                       (msg?.streamingMainContent || '').length)
            .reduce((sum, length) => sum + length, 0);
    }, [streamingMessages]);
    
    useEffect(() => {
        if (isStreaming && streamingContentLength > 0 && messageEndRef.current) {
            // Set flag to prevent scroll detection during streaming content scroll
            isProgrammaticScrollRef.current = true;
            
            // Use requestAnimationFrame for smooth scrolling during rapid updates
            requestAnimationFrame(() => {
                if (messageEndRef.current) {
                    messageEndRef.current.scrollIntoView({ behavior: "smooth" });
                }
            });
            
            // Clear flag after scroll completes
            setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, 1000);
        }
    }, [streamingContentLength, isStreaming]);
    
    // Cleanup timeouts
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
            if (scrollToBottomTimeoutRef.current) {
                clearTimeout(scrollToBottomTimeoutRef.current);
            }
        };
    }, []);

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
    
    // Scroll detection for loading more historical messages
    const loadMoreTriggerRef = useRef(0);
    const isLoadingMoreRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const scrollDetectionEnabledRef = useRef(false);
    
    // Enable scroll detection only after initial load is complete
    useEffect(() => {
        // Enable scroll detection once we have messages and initial load is done
        if (localMessages.length > 0) {
            // Delay enabling scroll detection to ensure everything is settled
            const enableTimer = setTimeout(() => {
                scrollDetectionEnabledRef.current = true;
            }, 2000); // Longer delay to ensure scroll to bottom is fully complete
            
            return () => clearTimeout(enableTimer);
        }
    }, [localMessages.length]); // Remove dependency on isInitialLoadRef since it changes too quickly
    
    useEffect(() => {
        const chatContainer = chatMessagesRef.current;
        if (!chatContainer) return;
        
        const handleScroll = () => {
            // Don't process scroll events if detection is not enabled yet
            if (!scrollDetectionEnabledRef.current) {
                return;
            }
            
            const atBottom = chatContainer.scrollTop >= (chatContainer.scrollHeight - chatContainer.clientHeight - 10);
            const atTop = chatContainer.scrollTop <= 100; // Increased threshold for easier testing
            
            
            // Don't trigger load more during programmatic scrolling, streaming, or if already loading
            if (isProgrammaticScrollRef.current || isStreaming || isLoadingMoreRef.current) {
                return;
            }
            
            // Only trigger load more if user genuinely scrolled to top
            if (atTop) {
                isLoadingMoreRef.current = true;
                isLoadingHistoricalRef.current = true; // Set flag to prevent auto-scroll
                
                // Trigger load more messages by incrementing the counter
                loadMoreTriggerRef.current += 1;
                setProps({ 
                    load_more_messages: loadMoreTriggerRef.current 
                });
                
                // Reset loading flags after a delay
                setTimeout(() => {
                    isLoadingMoreRef.current = false;
                    isLoadingHistoricalRef.current = false;
                }, 3000); // Slightly longer to ensure historical messages finish loading
            } else {
            }
        };
        
        chatContainer.addEventListener('scroll', handleScroll);
        return () => {
            chatContainer.removeEventListener('scroll', handleScroll);
        };
    }, [isStreaming, setProps]);
    
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
                    connectSSE();
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
            }
        };
        
        eventSource.onerror = (error) => {
            
            // If we received a stream_complete event, this is normal closure
            if (connectionClosed) {
                eventSource.close();
                return;
            }
            
            // Only handle as error if connection is actually broken (not normal completion)
            if (eventSource.readyState === EventSource.CLOSED) {
                return;
            }
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
                    return prev;
                }
            });
        };
        
        eventSource.onopen = () => {
            // Connection opened
        };
        
        sseRef.current = eventSource;
    };
    
    // Handle SSE messages
    const handleSSEMessage = useCallback((data) => {
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
                // Don't hide typing indicator yet - wait for first content
                break;
                
            case 'content':
                // Hide typing indicator when first content arrives
                setShowTyping(false);
                setStreamingMessages(prev => {
                    const existingMessage = prev[data.message_id];
                    if (!existingMessage) {
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
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        ...prev[data.message_id],
                        inThinkingMode: true
                    }
                }));
                break;
                
            case 'thinking_end':
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        ...prev[data.message_id],
                        inThinkingMode: false
                    }
                }));
                break;
                
            case 'stream_complete':
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
                        
                        // Move to local messages
                        setLocalMessages(prevLocal => [...prevLocal, completedMessage]);
                        
                        const newStreaming = { ...prev };
                        delete newStreaming[data.message_id];
                        
                        return newStreaming;
                    }
                    return prev;
                });
                
                // Always set streaming to false when we receive stream_complete for any message
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

            // Show typing indicator until LLM response starts
            setShowTyping(true);
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
            const hasThinkingContent = message.content && (
                message.content.includes('<think>') || 
                message.content.includes('&lt;think&gt;')
            );
            if (isStreaming || message.streamingThinkingContent || hasThinkingContent) {
                // Create stable key that includes streaming state to prevent unnecessary re-mounts
                const messageKey = `${message.id || index}-${message.role}-${isStreaming ? 'streaming' : 'complete'}`;
                return (
                    <StreamingMessage
                        key={messageKey}
                        message={message}
                        isStreaming={isStreaming}
                        bubbleStyle={bubbleStyle}
                        showThinkingProcess={showThinkingProcess}
                        thinkingAutoCollapse={thinkingAutoCollapse}
                        thinkingCollapseDelay={thinkingCollapseDelay}
                    />
                );
            }
            
            // Regular message rendering
            return (
                <div key={index} className={`chat-bubble ${message.role}`} style={bubbleStyle} data-message-id={message.id}>
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
            <div className="chat-messages" ref={chatMessagesRef}>
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
     * Fired when streaming completes for a message
     */
    streaming_complete: PropTypes.string,
};

export default ChatComponent;

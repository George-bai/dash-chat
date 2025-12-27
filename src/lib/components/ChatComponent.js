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
    if (!timestamp) {
        return '';
    }
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

MessageTimestamp.propTypes = {
    message: PropTypes.shape({
        timestamp: PropTypes.number,
        role: PropTypes.string
    }).isRequired,
    isStreaming: PropTypes.bool
};


// Parse thinking tags from streaming content
// Length of '<think>' tag
const THINK_TAG_OPEN_LENGTH = 7;
// Length of '</think>' tag
const THINK_TAG_CLOSE_LENGTH = 8;

const parseThinkingContent = (content, messageId = 'default') => {
    const thinkingSections = [];
    let mainContent = '';
    let currentThinking = null;
    let mainContentStarted = false;

    // Process content character by character to handle tags properly
    let i = 0;
    while (i < content.length) {
        if (content.slice(i, i + THINK_TAG_OPEN_LENGTH) === '<think>') {
            // Start thinking section with stable ID based on message ID and position
            currentThinking = {
                id: `thinking-${messageId}-${thinkingSections.length}`,
                content: '',
                isComplete: false
            };
            // Skip '<think>'
            i += THINK_TAG_OPEN_LENGTH;
        } else if (content.slice(i, i + THINK_TAG_CLOSE_LENGTH) === '</think>') {
            // End thinking section
            if (currentThinking) {
                currentThinking.isComplete = true;
                thinkingSections.push(currentThinking);
                currentThinking = null;
            }
            mainContentStarted = true;
            // Skip '</think>'
            i += THINK_TAG_CLOSE_LENGTH;
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
        let timer;
        if (contentRef.current) {
            // Small delay to ensure ReactMarkdown has rendered
            const RENDER_DELAY_MS = 50;
            timer = setTimeout(() => {
                const newHeight = contentRef.current.scrollHeight;
                setHeight(newHeight);
            }, RENDER_DELAY_MS);
        }

        return () => {
            if (timer) {
                clearTimeout(timer);
            }
        };
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

ThinkingSection.propTypes = {
    thinking: PropTypes.shape({
        id: PropTypes.string,
        content: PropTypes.string,
        isComplete: PropTypes.bool
    }).isRequired,
    isExpanded: PropTypes.bool,
    onToggle: PropTypes.func.isRequired,
    isStreaming: PropTypes.bool
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
                isComplete: !message.inThinkingMode && thinkingContent.length > 0
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
                        // Ignore storage errors
                        newExpanded[thinking.id] = false;
                    }
                }
            });

            setExpandedThinking(newExpanded);
        }
        // Depend on thinking IDs, not length
    }, [isStreaming, JSON.stringify(thinkingSections.map(t => t.id))]);

    // Auto-collapse completed thinking sections immediately when they complete
    // Historical messages (already complete) should NOT auto-collapse
    useEffect(() => {
        const timers = [];

        // Only auto-collapse if this was a streaming message
        // Don't auto-collapse historical messages that are already complete
        if (thinkingAutoCollapse && thinkingSections.length > 0 && wasEverStreamingRef.current) {
            thinkingSections.forEach(thinking => {
                // Only auto-collapse if:
                // 1. Thinking section is complete
                // 2. It's currently expanded (not already collapsed)
                // 3. This message was streaming at some point (not a historical message)
                // 4. We're either still streaming OR the thinking just completed
                if (thinking.isComplete && expandedThinking[thinking.id] === true) {
                    const timer = setTimeout(() => {
                        setExpandedThinking(prev => ({
                            ...prev,
                            [thinking.id]: false
                        }));
                    }, thinkingCollapseDelay);

                    timers.push(timer);
                }
            });
        }

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [JSON.stringify(thinkingSections.map(t => `${t.id}-${t.isComplete}`)), thinkingAutoCollapse, thinkingCollapseDelay, expandedThinking]);

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
                // Ignore storage errors
            }

            return newState;
        });
        // Remove dependencies to prevent excessive re-renders
    }, []);

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

StreamingMessage.propTypes = {
    message: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        role: PropTypes.string,
        content: PropTypes.string,
        streamingContent: PropTypes.string,
        streamingThinkingContent: PropTypes.string,
        streamingMainContent: PropTypes.string,
        inThinkingMode: PropTypes.bool,
        isStreaming: PropTypes.bool,
        timestamp: PropTypes.number
    }).isRequired,
    isStreaming: PropTypes.bool,
    bubbleStyle: PropTypes.object,
    showThinkingProcess: PropTypes.bool,
    thinkingAutoCollapse: PropTypes.bool,
    thinkingCollapseDelay: PropTypes.number
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
    setProps = () => { },
    fill_height: fillHeight = true,
    fill_width: fillWidth = true,
    user_bubble_style: userBubbleStyleProp = {},
    assistant_bubble_style: assistantBubbleStyleProp = {},
    input_placeholder: inputPlaceholder = "",
    class_name: className = "",
    persistence = false,
    persistence_type: persistenceType = "local",
    supported_input_file_types: accept = "*/*",
    attachment_spec: attachmentSpec = null,
    // New SSE streaming props
    streaming_enabled: streamingEnabled = false,
    sse_endpoint: sseEndpoint = null,
    show_thinking_process: showThinkingProcess = true,
    thinking_auto_collapse: thinkingAutoCollapse = true,
    thinking_collapse_delay: thinkingCollapseDelay = 300, // eslint-disable-line no-magic-numbers
    load_more_messages: loadMoreMessages = 0, // eslint-disable-line no-unused-vars
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

    // Refs for scroll management and historical message loading
    const isInitialLoadRef = useRef(true);
    const lastMessageCountRef = useRef(0);
    const scrollToBottomTimeoutRef = useRef(null);
    const isLoadingHistoricalRef = useRef(false);
    const previousScrollHeightRef = useRef(0);
    const previousFirstMessageIdRef = useRef(null);
    const previousMessagesRef = useRef([]);
    const previousMessageOffsetRef = useRef(0);
    const loadMoreTriggerRef = useRef(0);
    const isLoadingMoreRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const scrollDetectionEnabledRef = useRef(false);

    const countUserAttachments = (messagesList) => {
        if (!Array.isArray(messagesList)) {
            return 0;
        }

        return messagesList.reduce((count, message) => {
            if (!message || message.role !== "user") {
                return count;
            }

            const content = message.content;

            if (Array.isArray(content)) {
                const attachmentCount = content.filter((item) => {
                    return item && typeof item === "object" && item.type === "attachment";
                }).length;
                return count + attachmentCount;
            }

            if (content && typeof content === "object" && content.type === "attachment") {
                return count + 1;
            }

            return count;
        }, 0);
    };

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
    }, [id, persistence, storeType, messages]);

    // persist messages whenever localMessages updates
    useEffect(() => {
        if (persistence && localMessages.length > 0) {
            window[storeType].setItem(id, JSON.stringify(localMessages));
        }
    }, [localMessages, id, persistence, storeType]);

    // Handle new messages from props (including historical messages from database)

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
            const scrollHeightBefore = chatContainer?.scrollHeight || 0;

            // Find the first visible message in viewport
            let firstVisibleMessageId = null;
            let firstVisibleMessageOffset = 0;
            if (chatContainer && localMessages.length > 0) {
                const messageElements = chatContainer.querySelectorAll('[data-message-id]');
                const containerTop = chatContainer.scrollTop;
                const containerBottom = containerTop + chatContainer.clientHeight;

                for (const element of messageElements) {
                    const elementTop = element.offsetTop;
                    const elementBottom = elementTop + element.offsetHeight;
                    const messageId = element.getAttribute('data-message-id');

                    // Find first message that's at least partially visible
                    if (elementBottom > containerTop && elementTop < containerBottom) {
                        firstVisibleMessageId = messageId;
                        firstVisibleMessageOffset = elementTop - containerTop;
                        break;
                    }
                }
            }

            setLocalMessages(prev => {
                // Check for historical load first (before flow switch check)
                const isHistoricalLoad = prev.length > 0 &&
                    messages.length > prev.length &&
                    messages.some(msg => msg.id === prev[0].id) &&
                    messages[0].id !== prev[0].id;

                // For initial load
                if (messages.length >= 1 && prev.length === 0) {
                    return [...messages];
                }
                // Check for historical load (new messages prepended)
                else if (isHistoricalLoad) {
                    isLoadingHistoricalRef.current = true;

                    // Store the first visible message ID and its offset to maintain view
                    previousFirstMessageIdRef.current = firstVisibleMessageId || prev[0].id;
                    previousScrollHeightRef.current = scrollHeightBefore;
                    previousMessagesRef.current = prev;
                    previousMessageOffsetRef.current = firstVisibleMessageOffset;

                    // Replace all messages with the new set (which includes prepended historical messages)
                    return [...messages];
                }
                // Check if this is a complete flow switch by comparing message IDs
                const allMessageIdsMatch = prev.length > 0 && messages.length > 0 &&
                    messages.every(msg => prev.some(prevMsg => prevMsg.id === msg.id));

                if (!allMessageIdsMatch) {
                    return [...messages];
                }
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

            // Use requestAnimationFrame to ensure DOM has been painted
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Double RAF to ensure layout is complete
                    if (!chatMessagesRef.current) {
                        return;
                    }

                    // Find the element that was previously visible
                    const messageElements = chatMessagesRef.current.querySelectorAll('[data-message-id]');
                    let targetElement = null;

                    for (const element of messageElements) {
                        const messageId = element.getAttribute('data-message-id');
                        if (messageId === previousFirstMessageIdRef.current) {
                            targetElement = element;
                            break;
                        }
                    }

                    if (targetElement) {
                        // Restore the exact scroll position to keep the message at the same viewport position
                        const elementTop = targetElement.offsetTop;

                        // Calculate new scroll position to maintain the same visual offset
                        // The message should appear at the same distance from the top of the viewport
                        const newScrollTop = elementTop - previousMessageOffsetRef.current;

                        // Apply the scroll
                        chatMessagesRef.current.scrollTop = newScrollTop;

                        // Verify the scroll worked and fine-tune if needed
                        setTimeout(() => {
                            if (chatMessagesRef.current && targetElement) {
                                const currentElementRect = targetElement.getBoundingClientRect();
                                const currentContainerRect = chatMessagesRef.current.getBoundingClientRect();
                                const currentOffset = currentElementRect.top - currentContainerRect.top;

                                // Fine-tune if there's a significant difference
                                const OFFSET_THRESHOLD_PX = 5;
                                const offsetDiff = Math.abs(currentOffset - previousMessageOffsetRef.current);
                                if (offsetDiff > OFFSET_THRESHOLD_PX) {
                                    chatMessagesRef.current.scrollTop = elementTop - previousMessageOffsetRef.current;
                                }
                            }
                        }, 10); // eslint-disable-line no-magic-numbers
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
                        previousMessagesRef.current = [];
                        previousMessageOffsetRef.current = 0;
                        isProgrammaticScrollRef.current = false;
                    }, 300); // eslint-disable-line no-magic-numbers
                });
            });
        }
    }, [localMessages]);

    // Smart auto-scrolling: handle initial vs new messages differently

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
                            }, 100); // eslint-disable-line no-magic-numbers
                        } else {
                            // Container still doesn't have proper dimensions, wait longer
                            scrollToBottomTimeoutRef.current = setTimeout(scrollToBottomWhenReady, 100); // eslint-disable-line no-magic-numbers
                        }
                    };

                    // Start the scroll process with a reasonable delay
                    scrollToBottomTimeoutRef.current = setTimeout(scrollToBottomWhenReady, 200); // eslint-disable-line no-magic-numbers
                } else {
                    // For new messages, use smooth scroll
                    messageEndRef.current.scrollIntoView({ behavior: "smooth" });

                    // Clear flag after smooth scroll completes
                    setTimeout(() => {
                        isProgrammaticScrollRef.current = false;
                    }, 1000); // eslint-disable-line no-magic-numbers
                }
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
            }, 1000); // eslint-disable-line no-magic-numbers
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
            }, 1000); // eslint-disable-line no-magic-numbers
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

    // Enable scroll detection only after initial load is complete
    useEffect(() => {
        let enableTimer;
        // Enable scroll detection once we have messages and initial load is done
        if (localMessages.length > 0) {
            // Delay enabling scroll detection to ensure everything is settled
            const SCROLL_DETECTION_DELAY_MS = 2000;
            enableTimer = setTimeout(() => {
                scrollDetectionEnabledRef.current = true;
            }, SCROLL_DETECTION_DELAY_MS);
        }

        return () => {
            if (enableTimer) {
                clearTimeout(enableTimer);
            }
        };
    }, [localMessages.length]);

    useEffect(() => {
        const chatContainer = chatMessagesRef.current;

        const handleScroll = () => {
            if (!chatContainer) {
                return;
            }
            const scrollTop = chatContainer.scrollTop;
            const scrollHeight = chatContainer.scrollHeight;
            const clientHeight = chatContainer.clientHeight;

            // Calculate scroll percentage from top (0% = top, 100% = bottom)
            const scrollPercentageFromTop = (scrollTop / (scrollHeight - clientHeight)) * 100;
            // Trigger when scrolled to top 30% of the scrollable area (70% from bottom)
            const SCROLL_TOP_THRESHOLD_PERCENT = 30;
            const nearTop = scrollPercentageFromTop <= SCROLL_TOP_THRESHOLD_PERCENT;

            // Don't process scroll events if detection is not enabled yet
            if (!scrollDetectionEnabledRef.current) {
                return;
            }

            // Don't trigger load more during programmatic scrolling, streaming, or if already loading
            if (isProgrammaticScrollRef.current || isStreaming || isLoadingMoreRef.current || isLoadingHistoricalRef.current) {
                return;
            }

            // Only trigger load more if user genuinely scrolled to near top (30% from top)
            if (nearTop) {
                isLoadingMoreRef.current = true;
                // Set flag to prevent auto-scroll
                isLoadingHistoricalRef.current = true;

                // Trigger load more messages by incrementing the counter
                loadMoreTriggerRef.current += 1;
                setProps({
                    load_more_messages: loadMoreTriggerRef.current
                });

                // Reset loading flag after a reasonable delay
                const LOADING_RESET_DELAY_MS = 2000;
                setTimeout(() => {
                    isLoadingMoreRef.current = false;
                }, LOADING_RESET_DELAY_MS);
            }
        };

        if (chatContainer) {
            chatContainer.addEventListener('scroll', handleScroll);
        }

        return () => {
            if (chatContainer) {
                chatContainer.removeEventListener('scroll', handleScroll);
            }
        };
    }, [isStreaming, setProps]);

    // Initialize SSE connection (sanitize legacy prompt param if present)
    useEffect(() => {
        if (streamingEnabled && sseEndpoint) {
            try { console.info('[CHAT] SSE endpoint set:', sseEndpoint); } catch (e) {
                // Ignore console errors
            }
            // Close existing connection first
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }

            // Strip legacy prompt param if present
            let sanitizedEndpoint = sseEndpoint;
            try {
                const [base, query] = sseEndpoint.split('?');
                const params = new URLSearchParams(query || '');
                if (params.has('prompt')) {
                    params.delete('prompt');
                    const newQuery = params.toString();
                    sanitizedEndpoint = newQuery ? `${base}?${newQuery}` : base;
                    try { console.warn('[CHAT] Stripped legacy prompt param from SSE URL'); } catch (e) {
                        // Ignore console errors
                    }
                }
            } catch (e) {
                // Ignore URL parsing errors
            }

            // Connect SSE if required params are present
            const urlParams = new URLSearchParams((sanitizedEndpoint.split('?')[1]) || '');
            const messageId = urlParams.get('message_id');
            const userMessageId = urlParams.get('user_message_id');
            if (messageId && userMessageId) {
                connectSSE(sanitizedEndpoint); // eslint-disable-line no-use-before-define
            } else {
                try { console.warn('[CHAT] Missing required SSE params. message_id:', messageId, 'user_message_id:', userMessageId); } catch (e) {
                    // Ignore console errors
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

    const connectSSE = (endpointOverride = null) => {
        const endpointToUse = endpointOverride || sseEndpoint;
        if (!endpointToUse) {
            return;
        }

        // Don't create multiple connections to the same endpoint
        if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
        }
        const eventSource = new EventSource(endpointToUse);
        const completedMessages = new Set();
        let connectionClosed = false;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                try { console.debug('[CHAT] SSE message:', data.type); } catch (e) {
                    // Ignore console errors
                }
                // Track when messages complete normally
                if (data.type === 'stream_complete') {
                    completedMessages.add(data.message_id);
                    // Mark that we expect the connection to close
                    connectionClosed = true;
                }
                handleSSEMessage(data); // eslint-disable-line no-use-before-define
            } catch (e) {
                console.error('[CLIENT] Error parsing SSE message:', e);
            }
        };

        eventSource.onerror = (error) => {
            try { console.error('[CHAT] SSE error:', error); } catch (e) {
                // Ignore console errors
            }

            // If we received a stream_complete event, this is normal closure
            if (connectionClosed) {
                eventSource.close();
                return;
            }

            // Only handle as error if connection is actually broken (not normal completion)
            if (eventSource.readyState === EventSource.CLOSED) {
                return;
            }
            // Connection error - will be handled by streaming message state

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
                }
                return prev;
            });
        };

        eventSource.onopen = () => {
            try {
                console.info('[CHAT] SSE connection opened');
            } catch (e) {
                // Ignore console errors
            }
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

            case 'hitl_request':
                // Render a temporary assistant bubble with Approve/Cancel buttons
                setShowTyping(false);
                setStreamingMessages(prev => ({
                    ...prev,
                    [data.message_id]: {
                        id: data.message_id,
                        role: 'assistant',
                        content: '',
                        streamingContent: '',
                        streamingThinkingContent: prev[data.message_id]?.streamingThinkingContent || '',
                        streamingMainContent: prev[data.message_id]?.streamingMainContent || '',
                        inThinkingMode: false,
                        isStreaming: true,
                        timestamp: prev[data.message_id]?.timestamp || Date.now(),
                        hitlRequest: {
                            requestId: data.request_id,
                            tool: data.tool,
                            args: data.args || {}
                        }
                    }
                }));
                break;

            case 'hitl_decision_recorded':
                // Store decision result and clear hitlRequest after showing feedback
                setStreamingMessages(prev => {
                    const msg = prev[data.message_id];
                    if (!msg) {
                        return prev;
                    }
                    const updated = { ...prev };
                    updated[data.message_id] = {
                        ...msg,
                        // Store decision result for rendering
                        hitlDecision: {
                            approved: data.approved,
                            autoConfirmed: data.auto_confirmed || false,
                            reason: data.reason || (data.approved ? 'approved' : 'denied')
                        }
                    };
                    // Clear the hitlRequest since we now have a decision
                    if (updated[data.message_id].hitlRequest) {
                        delete updated[data.message_id].hitlRequest;
                    }
                    return updated;
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
                        inThinkingMode: false,
                        // Mark the thinking section as complete when thinking ends
                        streamingThinkingContent: prev[data.message_id]?.streamingThinkingContent || ''
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
                // Handle error by showing error message
                setStreamingMessages(prev => {
                    const streamingMessage = prev[data.message_id];
                    if (streamingMessage) {
                        // Create error message
                        const errorMessage = {
                            id: data.message_id,
                            role: streamingMessage.role || 'assistant',
                            content: data.error || 'An error occurred while processing your request.',
                            isStreaming: false,
                            timestamp: streamingMessage.timestamp,
                            completedAt: Date.now(),
                            isError: true
                        };


                        // Move to local messages
                        setLocalMessages(prevLocal => {
                            return [...prevLocal, errorMessage];
                        });

                        // Remove from streaming
                        const newStreaming = { ...prev };
                        delete newStreaming[data.message_id];

                        return newStreaming;
                    }
                    return prev;
                });
                setShowTyping(false);
                setIsStreaming(false);

                // Close the SSE connection since we got an error
                if (sseRef.current) {
                    sseRef.current.close();
                    sseRef.current = null;
                }

                // Clear the SSE endpoint to prevent automatic reconnection
                if (setProps) {
                    setProps({ sse_endpoint: null });
                }
                break;

            default:
                // Unknown message type - ignore
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

            // Show typing indicator until first content arrives
            setShowTyping(true);
            try { console.info('[CHAT] Message sent; typing indicator ON'); } catch (e) {
                // Ignore console errors
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

        // For each active streaming message:
        //  - Ask backend to cancel & persist "Response stopped by user."
        //  - Locally convert it into a completed cancel bubble for immediate UX.
        setStreamingMessages(prev => {
            const activeIds = Object.keys(prev || {});

            activeIds.forEach(messageId => {
                // Fire-and-forget cancel request to backend
                try {
                    fetch('/api/chat/cancel', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({ message_id: messageId }),
                    });
                } catch (e) {
                    // Ignore network errors; streamer fallback may still persist
                }

                // Preserve existing UX: show local "Response stopped by user." bubble
                const stoppedMessage = {
                    ...prev[messageId],
                    content: 'Response stopped by user.',
                    isStreaming: false,
                    completedAt: Date.now(),
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

            // Apply error styling if message is an error
            let bubbleStyle = message.role === "user" ? userBubbleStyle : assistantBubbleStyle;
            if (message.isError) {
                bubbleStyle = {
                    ...bubbleStyle,
                    backgroundColor: "#fee",
                    borderLeft: "3px solid #c00",
                    color: "#600"
                };
            }
            const isStreaming = message.isStreaming || false;

            // Use StreamingMessage for streaming messages or messages with thinking content
            const hasThinkingContent = message.content && (
                message.content.includes('<think>') ||
                message.content.includes('&lt;think&gt;')
            );
            if (isStreaming || message.streamingThinkingContent || hasThinkingContent || message.hitlRequest || message.hitlDecision) {
                // Create stable key that includes streaming state to prevent unnecessary re-mounts
                const messageKey = `${message.id || index}-${message.role}-${isStreaming ? 'streaming' : 'complete'}`;

                // Show decision result if we have one (resolved HITL request)
                if (message.hitlDecision) {
                    const { approved, autoConfirmed, reason } = message.hitlDecision;
                    const statusClass = approved ? 'hitl-approved' : 'hitl-denied';
                    const statusIcon = approved ? '✓' : '✗';
                    const statusText = approved ? 'Approved' : 'Denied';
                    return (
                        <div key={messageKey} className={`chat-bubble ${message.role}`} style={bubbleStyle} data-message-id={message.id}>
                            <MessageTimestamp message={message} isStreaming={isStreaming} />
                            <div className="markdown-content">
                                <div className={`hitl-decision-result ${statusClass}`}>
                                    <span className="hitl-status-icon">{statusIcon}</span>
                                    <span className="hitl-status-text">{statusText}</span>
                                    {autoConfirmed && <span className="hitl-auto-tag">(auto)</span>}
                                </div>
                                {reason && <div className="hitl-reason">{reason}</div>}
                            </div>
                        </div>
                    );
                }

                if (message.hitlRequest) {
                    const { requestId, tool } = message.hitlRequest;
                    const onDecision = async (approved) => {
                        try {
                            await fetch('/api/chat/hitl_decision', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    message_id: message.id,
                                    request_id: requestId,
                                    approved: Boolean(approved)
                                })
                            });
                        } catch (e) {
                            // Ignore fetch errors
                        }
                    };
                    return (
                        <div key={messageKey} className={`chat-bubble ${message.role}`} style={bubbleStyle} data-message-id={message.id}>
                            <MessageTimestamp message={message} isStreaming={isStreaming} />
                            <div className="markdown-content">
                                <div><strong>Approval needed</strong>: Allow tool <code>{tool}</code> to run?</div>
                                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                    <button className="btn-confirm" onClick={() => onDecision(true)}>Confirm</button>
                                    <button className="btn-cancel" onClick={() => onDecision(false)}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    );
                }

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
                    attachmentSpec={attachmentSpec}
                    currentAttachmentCount={countUserAttachments(localMessages)}
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
                    PropTypes.oneOfType([
                        PropTypes.shape({
                            type: PropTypes.oneOf(["text", "attachment", "table", "graph"]).isRequired,
                            props: PropTypes.object,
                        }),
                        PropTypes.object,
                        PropTypes.string,
                    ])
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
     * Attachment specification
     */
    attachment_spec: PropTypes.object,

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

    /**
     * Triggered when user scrolls to top to load more historical messages
     */
    load_more_messages: PropTypes.number,
};

export default ChatComponent;

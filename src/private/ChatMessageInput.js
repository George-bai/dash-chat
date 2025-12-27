/**
 * Example Usage:
 * ```
 * <MessageInput
 *     onSend={handleSend}
 *     handleInputChange={handleInput}
 *     value={messageValue}
 *     placeholder="Type your message here"
 *     buttonLabel="Send"
 *     customStyles={{ backgroundColor: "#f0f0f0" }}
 *     inputComponentStyles={{ padding: "10px" }}
 *     showTyping={showTyping}
 *     setAttachment={showTsetAttachmentyping}
 * />
 * ```
*/

import React, { useState, useRef } from "react";
import PropTypes from "prop-types";
import { Paperclip, Send, X, FileText, Square, File } from "lucide-react";

/**
 * Helper to check if file is a text/data file that should show FileText icon
 */
const isTextBasedFile = (fileName) => {
    const textExtensions = /\.(pdf|txt|md|csv|json)$/i;
    return textExtensions.test(fileName);
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif"];
const TEXT_EXTENSIONS = ["pdf", "txt", "md", "csv", "json"];

// eslint-disable-next-line no-magic-numbers
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_IMAGE_MAX_MB = 6;
const DEFAULT_PDF_CSV_MAX_MB = 3;
const DEFAULT_OTHER_TEXT_MAX_MB = 0.2;

const DEFAULT_ATTACHMENT_SPEC = {
    max_files: 6,
    jpg: DEFAULT_IMAGE_MAX_MB,
    jpeg: DEFAULT_IMAGE_MAX_MB,
    png: DEFAULT_IMAGE_MAX_MB,
    gif: DEFAULT_IMAGE_MAX_MB,
    pdf: DEFAULT_PDF_CSV_MAX_MB,
    csv: DEFAULT_PDF_CSV_MAX_MB,
    txt: DEFAULT_OTHER_TEXT_MAX_MB,
    md: DEFAULT_OTHER_TEXT_MAX_MB,
    json: DEFAULT_OTHER_TEXT_MAX_MB,
};

const normalizeAttachmentSpec = (spec) => {
    if (!spec || typeof spec !== "object") {
        return { ...DEFAULT_ATTACHMENT_SPEC };
    }

    const lowerCaseSpec = {};
    Object.keys(spec).forEach((key) => {
        if (typeof spec[key] === "number") {
            lowerCaseSpec[key.toLowerCase()] = spec[key];
        } else if (key === "max_files" && typeof spec[key] === "number") {
            lowerCaseSpec[key] = spec[key];
        }
    });

    return {
        ...DEFAULT_ATTACHMENT_SPEC,
        ...lowerCaseSpec,
    };
};

/**
 * A reusable message input component for chat interfaces.
*/

const MessageInput = ({
    onSend,
    handleInputChange,
    value,
    setAttachment,
    onStop,
    isStreaming = false,
    placeholder = "Start typing...",
    buttonLabel,
    customStyles = null,
    inputComponentStyles = null,
    showTyping = false,
    accept,
    attachmentSpec,
    currentAttachmentCount = 0,
}) => {
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [fileError, setFileError] = useState(null);

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const effectiveSpec = normalizeAttachmentSpec(attachmentSpec);
        const maxFiles = typeof effectiveSpec.max_files === "number" && effectiveSpec.max_files > 0
            ? effectiveSpec.max_files
            : DEFAULT_ATTACHMENT_SPEC.max_files;

        if (currentAttachmentCount >= maxFiles) {
            setFileError(`Maximum number of files (${maxFiles}) reached. You cannot attach more files.`);
            event.target.value = "";
            return;
        }

        const fileName = file.name || "";
        const extensionMatch = fileName.toLowerCase().match(/\.([0-9a-z]+)$/i);
        const ext = extensionMatch ? extensionMatch[1] : "";

        let allowedMb;
        const extKey = ext.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(effectiveSpec, extKey)) {
            allowedMb = effectiveSpec[extKey];
        } else if (IMAGE_EXTENSIONS.includes(extKey)) {
            allowedMb = DEFAULT_IMAGE_MAX_MB;
        } else if (TEXT_EXTENSIONS.includes(extKey)) {
            // Fallback defaults for text/data files when not explicitly specified
            if (extKey === "pdf" || extKey === "csv") {
                allowedMb = DEFAULT_PDF_CSV_MAX_MB;
            } else {
                allowedMb = DEFAULT_OTHER_TEXT_MAX_MB;
            }
        } else {
            setFileError(`File type .${ext || "unknown"} is not supported.`);
            event.target.value = "";
            return;
        }

        if (typeof allowedMb !== "number" || allowedMb <= 0) {
            setFileError(`File type .${ext || "unknown"} is not supported.`);
            event.target.value = "";
            return;
        }

        const maxBytes = allowedMb * BYTES_PER_MB;

        if (file.size > maxBytes) {
            setFileError(`File "${fileName}" is too large. Maximum size for .${extKey} files is ${allowedMb} MB.`);
            event.target.value = "";
            return;
        }

        setFileError(null);
        setSelectedFile(file);
        setAttachment(file);

        const fileType = file.type || "";
        if (fileType.startsWith("image/")) {
            setFilePreview(URL.createObjectURL(file));
        } else {
            setFilePreview(fileName);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setFilePreview(null);
        setFileError(null);
        if (setAttachment) {
            setAttachment(null);
        }
    };

    const handleSend = () => {
        if (value.trim() || selectedFile) {
            onSend(value.trim(), selectedFile);
            setSelectedFile(null);
            setFilePreview(null);
        }
    };

    return (
        <div className="message-input-container" style={customStyles}>
            {filePreview && (
                <div className="file-preview-container">
                    <button
                        className="remove-file-button"
                        onClick={handleRemoveFile}
                        data-testid="file-remove-button"
                    >
                        <X size={10} />
                    </button>
                    {selectedFile.type.startsWith("image/") ? (
                        <img src={filePreview} alt="Preview" className="file-preview-image" />
                    ) : (
                        <div className="file-preview">
                            {isTextBasedFile(selectedFile.name) ? (
                                <FileText size={15} />
                            ) : (
                                <File size={15} />
                            )}
                            <p className="file-name-preview">{selectedFile.name}</p>
                        </div>
                    )}
                </div>
            )}
            <textarea
                name="text"
                wrap="soft"
                value={value}
                placeholder={placeholder}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !showTyping) {
                        if (e.shiftKey) {
                            // Shift+Enter: Allow default behavior (new line)
                            return;
                        }
                        // Enter: Send message
                        e.preventDefault();
                        handleSend();
                    }
                }}
                style={inputComponentStyles}
                className="message-input-field"
            />
            <div className="input-with-icons">
                {fileError && (
                    <div className="file-error-message" data-testid="file-error-message">
                        {fileError}
                    </div>
                )}
                <button
                    className={`file-upload-button ${isStreaming ? 'disabled' : ''}`}
                    onClick={() => fileInputRef.current.click()}
                    data-testid="file-upload-button"
                    disabled={isStreaming}
                >
                    <Paperclip size={20} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept={Array.isArray(accept) ? accept.join(",") : accept}
                    onChange={handleFileUpload}
                    data-testid="file-input"
                />
                <button
                    onClick={isStreaming ? onStop : handleSend}
                    className={`message-input-button ${(showTyping || (!value?.trim() && !isStreaming)) ? 'disabled' : ''}`}
                    data-testid="send-button"
                    disabled={showTyping || (!value?.trim() && !isStreaming)}
                >
                    {isStreaming ? (
                        <Square size={18} />
                    ) : (
                        buttonLabel ? buttonLabel : <Send size={18} />
                    )}
                </button>
            </div>
        </div>
    );
};

MessageInput.propTypes = {
    /**
     * Callback to send the current message. Triggered on button click or pressing "Enter".
    */
    onSend: PropTypes.func.isRequired,
    /**
     * Callback to handle input field changes.
    */
    handleInputChange: PropTypes.func.isRequired,
    /**
     * The current value of the input field.
    */
    value: PropTypes.string,
    /**
     * Callback to stop streaming. Triggered when stop button is clicked.
    */
    onStop: PropTypes.func,
    /**
     * Whether a response is currently streaming.
    */
    isStreaming: PropTypes.bool,
    /**
     * Placeholder text for the input field. Default is `"Start typing..."`.
    */
    placeholder: PropTypes.string,
    /**
     * Label for the send button. Default is `"Send"`.
    */
    buttonLabel: PropTypes.string,
    /**
     * Inline styles for the container holding the input and button.
    */
    customStyles: PropTypes.object,
    /**
     * Inline styles for the input field.
    */
    inputComponentStyles: PropTypes.object,
    /**
     * Disable button when waiting for message.
    */
    showTyping: PropTypes.bool,
    /**
     * Set file attached to state.
    */
    setAttachment: PropTypes.func,
    /**
     * String or array of supported file types.
    */
    accept: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.arrayOf(PropTypes.string),
    ]),
    attachmentSpec: PropTypes.object,
    currentAttachmentCount: PropTypes.number,
};

export default MessageInput;

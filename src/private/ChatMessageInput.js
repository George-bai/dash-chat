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
    accept,
    attachmentSpec
}) => {
    const fileInputRef = useRef(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [filePreviews, setFilePreviews] = useState([]);
    const [fileError, setFileError] = useState(null);

    // Normalize attachment spec once per render so we can reuse it
    const effectiveSpec = normalizeAttachmentSpec(attachmentSpec);
    const maxFiles = typeof effectiveSpec.max_files === "number" && effectiveSpec.max_files > 0
        ? effectiveSpec.max_files
        : DEFAULT_ATTACHMENT_SPEC.max_files;

    // Apply max_files per message: only count files selected for the current message
    const totalExistingCount = selectedFiles.length;
    const isAtMaxFileLimit = totalExistingCount >= maxFiles;
    const hasDraftMessage = Boolean((value || "").trim() || selectedFiles.length > 0);
    const canSend = hasDraftMessage;
    const canStop = Boolean(isStreaming && !hasDraftMessage);

    const handleFileUpload = (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) {
            return;
        }

        // Calculate how many more files can be added for this message
        const remainingSlots = maxFiles - totalExistingCount;

        if (remainingSlots <= 0) {
            setFileError(`Maximum number of files (${maxFiles}) reached. You cannot attach more files.`);
            event.target.value = "";
            return;
        }

        // Limit files to remaining slots
        const filesToAdd = files.slice(0, remainingSlots);
        const validFiles = [];
        const validPreviews = [];

        for (const file of filesToAdd) {
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
                if (extKey === "pdf" || extKey === "csv") {
                    allowedMb = DEFAULT_PDF_CSV_MAX_MB;
                } else {
                    allowedMb = DEFAULT_OTHER_TEXT_MAX_MB;
                }
            } else {
                setFileError(`File type .${ext || "unknown"} is not supported.`);
                continue;
            }

            if (typeof allowedMb !== "number" || allowedMb <= 0) {
                setFileError(`File type .${ext || "unknown"} is not supported.`);
                continue;
            }

            const maxBytes = allowedMb * BYTES_PER_MB;

            if (file.size > maxBytes) {
                setFileError(`File "${fileName}" is too large. Maximum size for .${extKey} files is ${allowedMb} MB.`);
                continue;
            }

            // File is valid - add it
            validFiles.push(file);

            const fileType = file.type || "";
            if (fileType.startsWith("image/")) {
                validPreviews.push({
                    url: URL.createObjectURL(file),
                    name: fileName,
                    isImage: true
                });
            } else {
                validPreviews.push({
                    url: null,
                    name: fileName,
                    isImage: false
                });
            }
        }

        if (validFiles.length > 0) {
            // Clear any previous error once we have at least one valid file
            setFileError(null);
            const newSelectedFiles = [...selectedFiles, ...validFiles];
            const newFilePreviews = [...filePreviews, ...validPreviews];

            setSelectedFiles(newSelectedFiles);
            setFilePreviews(newFilePreviews);
            setAttachment(newSelectedFiles);
        }

        // Reset file input so same file can be selected again
        event.target.value = "";
    };

    const handleRemoveFile = (indexToRemove) => {
        // Revoke object URL if it's an image preview
        if (filePreviews[indexToRemove]?.url) {
            URL.revokeObjectURL(filePreviews[indexToRemove].url);
        }

        const newSelectedFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
        const newFilePreviews = filePreviews.filter((_, index) => index !== indexToRemove);

        setSelectedFiles(newSelectedFiles);
        setFilePreviews(newFilePreviews);

        if (setAttachment) {
            setAttachment(newSelectedFiles.length > 0 ? newSelectedFiles : null);
        }

        // If we're now under the limit, clear any lingering "max files" error
        const updatedCount = newSelectedFiles.length;
        if (updatedCount < maxFiles && fileError && fileError.startsWith("Maximum number of files")) {
            setFileError(null);
        }
    };

    const handleSend = () => {
        if (value.trim() || selectedFiles.length > 0) {
            onSend(value.trim(), selectedFiles.length > 0 ? selectedFiles : null);
            // Revoke all object URLs
            filePreviews.forEach(preview => {
                if (preview.url) {
                    URL.revokeObjectURL(preview.url);
                }
            });
            setSelectedFiles([]);
            setFilePreviews([]);
            setFileError(null);
        }
    };

    return (
        <div className="message-input-container" style={customStyles}>
            {filePreviews.length > 0 && (
                <div className="file-previews-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px' }}>
                    {filePreviews.map((preview, index) => (
                        <div key={index} className="file-preview-container" style={{ position: 'relative' }}>
                            <button
                                className="remove-file-button"
                                onClick={() => handleRemoveFile(index)}
                                data-testid={`file-remove-button-${index}`}
                            >
                                <X size={10} />
                            </button>
                            {preview.isImage ? (
                                <img src={preview.url} alt={preview.name} className="file-preview-image" />
                            ) : (
                                <div className="file-attachment-card">
                                    {isTextBasedFile(preview.name) ? (
                                        <FileText size={24} className="file-attachment-icon" />
                                    ) : (
                                        <File size={24} className="file-attachment-icon" />
                                    )}
                                    <div className="file-attachment-info">
                                        <span className="file-attachment-name">{preview.name}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <textarea
                name="text"
                wrap="soft"
                value={value}
                placeholder={placeholder}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        if (e.shiftKey) {
                            // Shift+Enter: Allow default behavior (new line)
                            return;
                        }
                        // Enter: Send message (supports steering while streaming)
                        if (canSend) {
                            e.preventDefault();
                            handleSend();
                        }
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
                    className={`file-upload-button ${(isStreaming || isAtMaxFileLimit) ? 'disabled' : ''}`}
                    onClick={() => {
                        if (!isStreaming && !isAtMaxFileLimit && fileInputRef.current) {
                            fileInputRef.current.click();
                        }
                    }}
                    data-testid="file-upload-button"
                    disabled={isStreaming || isAtMaxFileLimit}
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
                    multiple
                />
                <button
                    onClick={() => {
                        if (canSend) {
                            handleSend();
                            return;
                        }
                        if (canStop) {
                            if (onStop) {
                                onStop();
                            }
                        }
                    }}
                    className={`message-input-button ${(canSend || canStop) ? '' : 'disabled'}`}
                    data-testid="send-button"
                    disabled={!(canSend || canStop)}
                >
                    {canStop ? (
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

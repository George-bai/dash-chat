import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MessageInput from "../../src/private/ChatMessageInput";

describe("ChatMessageInput steering behavior", () => {
    test("sends a steering message while streaming when draft text exists", () => {
        const onSend = jest.fn();
        const onStop = jest.fn();

        render(
            <MessageInput
                value="please continue but use top 3 rows"
                onSend={onSend}
                onStop={onStop}
                isStreaming={true}
                handleInputChange={() => { }}
                setAttachment={() => { }}
            />
        );

        const sendButton = screen.getByTestId("send-button");
        expect(sendButton).not.toBeDisabled();

        fireEvent.click(sendButton);

        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith("please continue but use top 3 rows", null);
        expect(onStop).not.toHaveBeenCalled();
    });

    test("keeps stop action available while streaming when input is empty", () => {
        const onSend = jest.fn();
        const onStop = jest.fn();

        render(
            <MessageInput
                value=""
                onSend={onSend}
                onStop={onStop}
                isStreaming={true}
                handleInputChange={() => { }}
                setAttachment={() => { }}
            />
        );

        const sendButton = screen.getByTestId("send-button");
        expect(sendButton).not.toBeDisabled();

        fireEvent.click(sendButton);

        expect(onStop).toHaveBeenCalledTimes(1);
        expect(onSend).not.toHaveBeenCalled();
    });

    test("supports Enter-to-send steering while streaming", () => {
        const onSend = jest.fn();

        render(
            <MessageInput
                value="steer with enter"
                onSend={onSend}
                onStop={() => { }}
                isStreaming={true}
                handleInputChange={() => { }}
                setAttachment={() => { }}
            />
        );

        const input = screen.getByRole("textbox");
        fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith("steer with enter", null);
    });
});

import type { Prompt } from '../types';

console.log('Quick Prompt Filler content script loaded');

// Helper to set value in React/Native inputs/textareas
function setNativeValue(element: HTMLElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter?.call(element, value);
    } else {
        valueSetter?.call(element, value);
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
}

// Function to insert text based on the current site
function insertText(text: string) {
    const url = window.location.href;
    let inputElement: HTMLElement | null = null;
    let success = false;

    if (url.includes('chatgpt.com')) {
        // ChatGPT now uses a contenteditable div with id="prompt-textarea"
        inputElement = document.querySelector('#prompt-textarea') as HTMLElement;

        if (!inputElement) {
            // Fallback selector
            inputElement = document.querySelector('textarea[placeholder*="Message"]') as HTMLElement;
        }

        if (inputElement) {
            // Check if it's a contenteditable div (current ChatGPT UI)
            if (inputElement.getAttribute('contenteditable') === 'true') {
                // Focus the element
                inputElement.focus();

                // Clear existing content and insert new text
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(inputElement);
                selection?.removeAllRanges();
                selection?.addRange(range);

                // Use execCommand to preserve formatting
                document.execCommand('insertText', false, text);
                success = true;
            }
            // Fallback for textarea (older ChatGPT UI)
            else if (inputElement instanceof HTMLTextAreaElement) {
                inputElement.focus();
                inputElement.value = text;
                setNativeValue(inputElement, text);

                // Dispatch additional events for React
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
                inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
                success = true;
            }
        }
    } else if (url.includes('claude.ai')) {
        // Claude uses a contenteditable div (ProseMirror)
        inputElement = document.querySelector('.ProseMirror[contenteditable="true"]') as HTMLElement;

        if (!inputElement) {
            // Fallback selector
            inputElement = document.querySelector('div[contenteditable="true"]') as HTMLElement;
        }

        if (inputElement) {
            // Focus the element first
            inputElement.focus();

            // Clear existing content
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inputElement);
            selection?.removeAllRanges();
            selection?.addRange(range);

            // Use execCommand to insert text - this preserves newlines
            document.execCommand('insertText', false, text);
            success = true;
        }
    } else if (url.includes('gemini.google.com')) {
        // Gemini uses contenteditable
        inputElement = document.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement;

        if (!inputElement) {
            // Fallback selectors
            inputElement = document.querySelector('.ql-editor[contenteditable="true"]') as HTMLElement;
        }

        if (!inputElement) {
            inputElement = document.querySelector('div[contenteditable="true"]') as HTMLElement;
        }

        if (inputElement) {
            // Focus the element
            inputElement.focus();

            // Clear existing content and insert new text
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inputElement);
            selection?.removeAllRanges();
            selection?.addRange(range);

            // Use execCommand to preserve formatting
            document.execCommand('insertText', false, text);

            // Dispatch input event for Gemini's framework
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            success = true;
        }
    }

    if (!success || !inputElement) {
        console.warn('Quick Prompt: Could not find input element.');
        alert('Quick Prompt: Could not find input element for this site.');
    }
}

// Listen for messages from the Popup
chrome.runtime.onMessage.addListener((message: { type: string; prompt: Prompt }, _sender, sendResponse) => {
    if (message.type === 'FILL_PROMPT' && message.prompt) {
        insertText(message.prompt.content);
        sendResponse({ status: 'success' });
    }
});

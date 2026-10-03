import type { FillPromptResponse } from '../types';

// Prefer composer attributes over generated class names or translated labels.
const chatgptSelectors = [
    '[data-composer-markdown][contenteditable="true"]',
    '[data-composer-input] [contenteditable="true"][role="textbox"]',
    '#prompt-textarea[contenteditable="true"]',
    'textarea#prompt-textarea',
    '[data-composer-input] textarea',
    'textarea[placeholder*="Message"]',
];

function findInput(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
            // Hidden or inactive composers can remain mounted during navigation.
            if (element.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) continue;
            if (element instanceof HTMLTextAreaElement && (element.disabled || element.readOnly)) continue;
            if (!element.getClientRects().length || getComputedStyle(element).visibility !== 'visible') continue;
            return element;
        }
    }
    return null;
}

function setNativeValue(element: HTMLTextAreaElement, value: string) {
    // Use the native setter so React sees the value change when input fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) return false;

    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value === value;
}

export function insertText(text: string, hostname = window.location.hostname): FillPromptResponse {
    let inputElement: HTMLElement | null;

    if (hostname === 'chatgpt.com') {
        inputElement = findInput(chatgptSelectors);
    } else if (hostname === 'claude.ai') {
        inputElement = findInput([
            '[data-testid="chat-input"][contenteditable="true"]',
            '[data-composer-editor][contenteditable="true"]',
            '.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
        ]);
    } else if (hostname === 'gemini.google.com') {
        inputElement = findInput([
            '.ql-editor[contenteditable="true"][role="textbox"]',
            '.ql-editor[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]:not(.ql-clipboard)',
        ]);
    } else {
        return { status: 'error', message: '请在 ChatGPT、Gemini 或 Claude 网页上使用。' };
    }

    if (!inputElement) {
        return { status: 'error', message: '未找到可用的聊天输入框，请等待页面加载完成或刷新后重试。' };
    }

    inputElement.focus();

    if (inputElement instanceof HTMLTextAreaElement) {
        if (setNativeValue(inputElement, text)) return { status: 'success' };
    } else {
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(inputElement);
            selection.removeAllRanges();
            selection.addRange(range);

            // Native editing keeps ProseMirror's state, newlines and undo in sync.
            const inserted = document.execCommand('insertText', false, text);
            if (inserted) {
                if (hostname === 'gemini.google.com') {
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return { status: 'success' };
            }
        }
    }

    return { status: 'error', message: '无法写入聊天输入框，请点击输入框后重试。' };
}

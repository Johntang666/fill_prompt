import type { FillPromptResponse, Prompt } from '../types';
import { insertText } from './insertText';

console.log('Quick Prompt Filler content script loaded');

chrome.runtime.onMessage.addListener((message: { type: string; prompt?: Prompt }, _sender, sendResponse) => {
    if (message.type === 'QUICK_PROMPT_PING') {
        sendResponse({ protocolVersion: 1 });
        return;
    }
    if (message.type !== 'FILL_PROMPT') return;

    let response: FillPromptResponse;
    if (typeof message.prompt?.content !== 'string') {
        response = { status: 'error', message: '提示词内容无效，请重新选择。' };
    } else {
        try {
            response = insertText(message.prompt.content);
        } catch (error) {
            console.error('Quick Prompt: Could not fill input.', error);
            response = { status: 'error', message: '填充失败，请刷新网页后重试。' };
        }
    }

    sendResponse(response);
});

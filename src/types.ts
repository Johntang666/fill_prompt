export interface Prompt {
  id: string;
  title: string;
  content: string;
}

export type FillPromptResponse =
  | { status: 'success' }
  | { status: 'error'; message: string };

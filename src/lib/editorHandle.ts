export interface PreviewLocateQuery {
  type: string;
  src?: string;
  alt?: string;
  text?: string;
}

export interface EditorHandle {
  getValue(): string;
  getScrollElement(): HTMLElement | null;
  insertAtCursor(text: string): void;
  setSelection(start: number, end: number): void;
  locateBlock(query: PreviewLocateQuery): void;
  focus(): void;
}

export function insertAtCursor(editor: EditorHandle, text: string) {
  editor.insertAtCursor(text);
}

export function selectEditorRange(editor: EditorHandle, start: number, end: number) {
  editor.focus();
  editor.setSelection(start, end);
}

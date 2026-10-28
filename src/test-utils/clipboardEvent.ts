/**
 * jsdom has no ClipboardEvent, which ProseMirror's pasteHTML makes; import
 * this in an editor test that pastes.
 */
if (typeof ClipboardEvent === 'undefined') {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, init: EventInit & { clipboardData?: DataTransfer | null } = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? null;
    }
  };
}

export {};

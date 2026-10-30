/**
 * sync-handlers.ts
 * Loads every service that sends queued changes (src/lib/sync), so their
 * handlers are registered before the queue's first flush after a start.
 * Imported once by app/_layout.tsx.
 */

import './note.service';
import './session.service';
import './source-file.service';
import './document.service';
import './document-tabs.service';
import './preferences.service';
import './doc-photo.service';
import './lecture-conversion.service';

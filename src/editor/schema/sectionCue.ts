import { Extension } from '@tiptap/core';

import { quizMePlugin } from './quizMe';

/**
 * A summary section's cue question (step 7.7; SUMMARY-SPEC: "each section has a 'Quiz me' toggle that
 * hides the content and shows the cue question"): kept on the section's heading, so Quiz me (9.1,
 * quizMe.ts) needs nothing new from the summary. Not shown in the text. Shared by both editors.
 */
export const SectionCue = Extension.create({
  name: 'sectionCue',

  addProseMirrorPlugins() {
    return [quizMePlugin()];
  },

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          cue: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-cue') || null,
            renderHTML: (attrs) => (typeof attrs.cue === 'string' && attrs.cue ? { 'data-cue': attrs.cue } : {}),
          },
        },
      },
    ];
  },
});

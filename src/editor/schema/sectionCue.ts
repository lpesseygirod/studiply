import { Extension } from '@tiptap/core';

/**
 * A summary section's cue question (step 7.7; SUMMARY-SPEC: "each section has a 'Quiz me' toggle that
 * hides the content and shows the cue question"): kept on the section's heading, so Quiz me (9.1)
 * needs nothing new from the summary. Not shown in the text. Shared by both editors.
 */
export const SectionCue = Extension.create({
  name: 'sectionCue',

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

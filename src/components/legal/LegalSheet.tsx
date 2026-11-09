/**
 * LegalSheet.tsx
 * A legal page opened over the screen (step 10.1b-1), where leaving would lose something: sign-up
 * (the form) and the AI consent screen. The same page as the route, from the texts bundled with
 * the app (works offline). Links to another legal page open inside the sheet; "‹" goes back, then
 * closes.
 *
 * Escape (laptop) is the Modal's own: React Native Web calls onRequestClose of the topmost modal
 * only, on keyup. A keydown listener here closed the sheet first, so the keyup that followed found
 * the consent screen on top and closed it too; now one Escape closes one layer.
 */

import React, { useState } from 'react';
import { Modal, Platform } from 'react-native';

import { LEGAL_TEXTS } from '../../legal/texts.generated';
import type { LegalSlug } from '../../legal/types';
import { LegalPageView } from './LegalPageView';

interface Props {
  slug: LegalSlug | null;
  onClose: () => void;
  /** Where "‹" says it goes when it closes ("Back"). */
  closeLabel?: string;
}

export function LegalSheet({ slug, onClose, closeLabel = 'Back' }: Props) {
  if (slug === null) return null;
  return <Sheet key={slug} slug={slug} onClose={onClose} closeLabel={closeLabel} />;
}

function Sheet({ slug, onClose, closeLabel }: { slug: LegalSlug; onClose: () => void; closeLabel: string }) {
  const [stack, setStack] = useState<LegalSlug[]>([slug]);
  const current = stack[stack.length - 1];
  const back = () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onClose());

  return (
    <Modal visible animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={back}>
      <LegalPageView
        slug={current}
        backLabel={stack.length > 1 ? LEGAL_TEXTS[stack[stack.length - 2]].title : closeLabel}
        onBack={back}
        onOpenPage={(next) => setStack((s) => (s[s.length - 1] === next ? s : [...s, next]))}
      />
    </Modal>
  );
}

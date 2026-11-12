import React from 'react';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';

import { useAuth } from '../../hooks/useAuth';
import { backTarget, legalHref } from '../../legal/pages';
import type { LegalSlug } from '../../legal/types';
import { LegalPageView } from './LegalPageView';

/**
 * A legal page as a route (/privacy, /terms, /refunds, /cookies, /legal), signed in
 * or signed out (the root layout lets app/(legal) through). The pages are their own group, so the
 * screen they were opened from isn't behind them: "‹ Back" goes to the legal page before it (a
 * link inside the texts), else to `?from=` (Settings passes where she was), else to Settings when
 * signed in and the sign-in screen when signed out (a page opened by its address).
 */
export function LegalRoute({ slug }: { slug: LegalSlug }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isOnboarded } = useAuth();

  const back = () => {
    if ((navigation.getState()?.index ?? 0) > 0) navigation.goBack();
    else router.replace(backTarget(from) ?? ((isOnboarded ? '/settings' : '/') as Href));
  };

  return <LegalPageView slug={slug} backLabel="Back" onBack={back} onOpenPage={(next) => router.push(legalHref(next))} />;
}

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, type Href } from 'expo-router';

import type { Breadcrumb } from '../../services/folder.service';
import { courseAt } from '../../utils/shelf';

/**
 * What the focused screen tells the laptop shell: where it is
 * (course and folder: the sidebar expands that course, Record lecture
 * preselects it) and, for documents, the top bar's breadcrumb, title and
 * "Saved · time". Screens publish with `useShellScreen`; it is cleared when
 * they lose focus. The iPhone has no shell, so it is simply unused there.
 */

export interface Crumb {
  label: string;
  href: Href;
}

export interface DocumentHeader {
  crumbs: Crumb[];
  title: string;
  /** "Saved · 10:31", "Saving…", "Not saved"; null shows nothing. */
  saved: string | null;
}

export interface ShellLocation {
  courseId: string | null;
  folderId: string | null;
  /** The open lecture or file, highlighted in the sidebar. */
  itemId?: string | null;
}

interface Published {
  owner: number;
  location: ShellLocation | null;
  header: DocumentHeader | null;
}

interface ShellState {
  location: ShellLocation | null;
  header: DocumentHeader | null;
  publish: (value: Published) => void;
  clear: (owner: number) => void;
}

const EMPTY: Published = { owner: 0, location: null, header: null };

const ShellContext = createContext<ShellState>({
  location: null,
  header: null,
  publish: () => {},
  clear: () => {},
});

export function ShellProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Published>(EMPTY);
  const publish = useCallback((next: Published) => setValue(next), []);
  // Only the screen that published clears: the next screen may publish first.
  const clear = useCallback((owner: number) => setValue((prev) => (prev.owner === owner ? EMPTY : prev)), []);
  const state = useMemo(
    () => ({ location: value.location, header: value.header, publish, clear }),
    [value, publish, clear],
  );
  return <ShellContext.Provider value={state}>{children}</ShellContext.Provider>;
}

export function useShell(): Pick<ShellState, 'location' | 'header'> {
  const { location, header } = useContext(ShellContext);
  return { location, header };
}

let nextOwner = 1;

/** Publishes this screen's place (and document header) while it is focused. */
export function useShellScreen(location: ShellLocation | null, header: DocumentHeader | null = null): void {
  const { publish, clear } = useContext(ShellContext);
  const ownerRef = useRef(0);
  if (ownerRef.current === 0) ownerRef.current = nextOwner++;
  const key = JSON.stringify([location, header]);
  const latest = useRef({ location, header });
  latest.current = { location, header };

  useFocusEffect(
    useCallback(() => {
      const owner = ownerRef.current;
      publish({ owner, ...latest.current });
      return () => clear(owner);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- re-publish when the content changes
    }, [key, publish, clear]),
  );
}

// -------------------------------------------------------------------
// Commands (keyboard shortcuts): the focused screen that can do it does it
// -------------------------------------------------------------------

/** `openAssistant`: a question's Full answer link opens the laptop's study assistant panel. */
export type ShellCommand = 'newFolder' | 'upload' | 'focusSearch' | 'showShortcuts' | 'contextMenu' | 'cut' | 'copy' | 'openAssistant';

/** A handler may return false: "nothing to do here now" (⌘C with no tile selected stays the browser's). */
type CommandHandler = () => void | boolean;

const commandHandlers = new Map<ShellCommand, CommandHandler[]>();

/** Runs the command on the screen that registered it last; false when none can (or it didn't). */
export function runShellCommand(command: ShellCommand): boolean {
  const list = commandHandlers.get(command);
  const handler = list?.[list.length - 1];
  if (!handler) return false;
  return handler() !== false;
}

/** Whether a focused screen can run the command now (the New menu greys out what it can't). */
export function hasShellCommand(command: ShellCommand): boolean {
  return (commandHandlers.get(command)?.length ?? 0) > 0;
}

/** Registers a command handler for as long as the calling component is mounted. */
export function registerShellCommand(command: ShellCommand, handler: CommandHandler): () => void {
  const list = commandHandlers.get(command) ?? [];
  commandHandlers.set(command, [...list, handler]);
  return () => {
    commandHandlers.set(command, (commandHandlers.get(command) ?? []).filter((h) => h !== handler));
  };
}

/** A screen handles the command while it is focused. */
export function useShellCommand(command: ShellCommand, handler: CommandHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(useCallback(() => registerShellCommand(command, () => ref.current()), [command]));
}

/** Record lecture: preselects the course and folder the student is in. */
export function recordHref(location: ShellLocation | null): Href {
  return location?.courseId
    ? {
        pathname: '/record',
        params: { projectId: location.courseId, ...(location.folderId && { folderId: location.folderId }) },
      }
    : '/record';
}

/**
 * The top bar's crumbs for something in a course: the course, then its
 * folders (getFolderBreadcrumbs gives course › folder › subfolder).
 */
export function courseCrumbs(courseId: string | null, chain: Breadcrumb[]): Crumb[] {
  if (!courseId) return [{ label: 'My library', href: '/library' }];
  return chain.map((c) => ({
    label: c.name,
    href: c.type === 'project' ? courseAt(courseId, null) : courseAt(courseId, c.id),
  }));
}

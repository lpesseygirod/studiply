// The parts of react-test-renderer (installed by jest-expo) that the tests
// use; it ships without types.
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestInstance {
    instance: unknown;
    props: Record<string, unknown>;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void): void;
  export function act(callback: () => Promise<void>): Promise<void>;
}

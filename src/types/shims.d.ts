// Minimal type declarations for libraries whose @types packages are not
// available in the offline build environment. They describe only the APIs this
// app uses. Swap for @types/react, @types/react-dom and @types/d3-sankey when
// your environment can install them.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type Key = string | number;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type RefObject<T> = { current: T };
  export type FC<P = Record<string, unknown>> = (props: P) => any;
  export type ChangeEvent<T = any> = any;
  export type KeyboardEvent<T = any> = any;
  export type PointerEvent<T = any> = any;
  export type MouseEvent<T = any> = any;
  export type DragEvent<T = any> = any;
  export type WheelEvent<T = any> = any;
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): RefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T | null>;
  export function useRef<T = undefined>(): RefObject<T | undefined>;
  export function useId(): string;
  export function useDeferredValue<T>(v: T): T;
  export function useTransition(): [boolean, (cb: () => void) => void];
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function lazy<T>(load: () => Promise<{ default: T }>): T;
  export function memo<T>(c: T): T;
  export const Fragment: any;
  export const StrictMode: any;
  export const Suspense: any;
  const React: any;
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
  export namespace JSX {
    type Element = any;
    interface ElementClass {
      render: any;
    }
    interface IntrinsicAttributes {
      key?: string | number | null;
    }
    interface ElementChildrenAttribute {
      children: unknown;
    }
    interface IntrinsicElements {
      [elem: string]: any;
    }
  }
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: any): void; unmount(): void };
}

declare module 'd3-sankey' {
  export interface SankeyGraph<N, L> {
    nodes: N[];
    links: L[];
  }
  export interface SankeyGenerator<N, L> {
    (graph: SankeyGraph<N, L>): SankeyGraph<N & { x0: number; x1: number; y0: number; y1: number; value: number }, L & { width: number; y0: number; y1: number }>;
    nodeId(f: (n: N) => string): SankeyGenerator<N, L>;
    nodeWidth(w: number): SankeyGenerator<N, L>;
    nodePadding(p: number): SankeyGenerator<N, L>;
    extent(e: [[number, number], [number, number]]): SankeyGenerator<N, L>;
  }
  export function sankey<N = any, L = any>(): SankeyGenerator<N, L>;
  export function sankeyLinkHorizontal(): (link: any) => string | null;
}

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

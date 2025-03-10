declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module 'react' {
  export type ReactNode = 
    | React.ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | React.ReactNodeArray;

  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: string | null;
  }

  export type ReactNodeArray = Array<ReactNode>;

  export type JSXElementConstructor<P> = 
    | ((props: P) => ReactElement<any, any> | null)
    | (new (props: P) => Component<any, any>);

  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}

  export interface SyntheticEvent<T = Element, E = Event> {
    nativeEvent: E;
    currentTarget: T;
    target: EventTarget;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    eventPhase: number;
    isTrusted: boolean;
    preventDefault(): void;
    isDefaultPrevented(): boolean;
    stopPropagation(): void;
    isPropagationStopped(): boolean;
    persist(): void;
    timeStamp: number;
    type: string;
  }

  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T;
  }

  export interface Component<P = {}, S = {}> {
    props: P;
    state: S;
    context: any;
    setState(state: Partial<S> | ((prevState: S, props: P) => Partial<S>), callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
    render(): ReactNode;
  }

  export interface FC<P = {}> {
    (props: P): ReactElement<any, any> | null;
    displayName?: string;
  }

  export function createElement(
    type: string | ((props: any) => ReactElement | null),
    props?: any,
    ...children: ReactNode[]
  ): ReactElement;

  export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useRef<T = any>(initialValue: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
  
  // Add React.Fragment
  export const Fragment: React.ComponentType<{ children?: ReactNode }>;
}

declare module 'next/link' {
  import { ReactNode } from 'react';
  export interface LinkProps {
    href: string;
    as?: string;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    prefetch?: boolean;
    locale?: string | false;
    className?: string;
    children: ReactNode;
  }
  export default function Link(props: LinkProps): JSX.Element;
}

declare module 'next/router' {
  export interface NextRouter {
    route: string;
    pathname: string;
    query: any;
    asPath: string;
    push(url: string, as?: string, options?: any): Promise<boolean>;
    replace(url: string, as?: string, options?: any): Promise<boolean>;
    reload(): void;
    back(): void;
    prefetch(url: string): Promise<void>;
    beforePopState(cb: (state: any) => boolean): void;
    events: {
      on(type: string, handler: (...evts: any[]) => void): void;
      off(type: string, handler: (...evts: any[]) => void): void;
      emit(type: string, ...evts: any[]): void;
    };
    isFallback: boolean;
  }
  export function useRouter(): NextRouter;
}

declare module 'next/head' {
  import { ReactNode } from 'react';
  export default function Head(props: { children: ReactNode }): JSX.Element;
}

declare module '@supabase/auth-helpers-react' {
  import { ReactNode } from 'react';
  export interface Session {
    user: any;
    access_token: string;
    refresh_token: string;
  }
  export function useSession(): Session | null;
  export function useSupabaseClient(): any;
  export interface SessionContextProviderProps {
    supabaseClient: any;
    initialSession?: Session | null;
    children: ReactNode;
  }
  export function SessionContextProvider(props: SessionContextProviderProps): JSX.Element;
}

declare module '@supabase/auth-helpers-nextjs' {
  export function createPagesBrowserClient(options?: any): any;
}

declare module 'next/app' {
  import { NextPage } from 'next';
  import { Router } from 'next/router';
  import { Session } from '@supabase/auth-helpers-react';
  
  export type AppProps<P = any> = {
    Component: NextPage<P> & {
      getLayout?: (page: JSX.Element) => JSX.Element;
    };
    router: Router;
    __N_SSG?: boolean;
    __N_SSP?: boolean;
    pageProps: P & {
      initialSession?: Session;
    };
  };
}

declare module 'react-query' {
  export interface QueryClientConfig {
    defaultOptions?: {
      queries?: {
        refetchOnWindowFocus?: boolean;
        retry?: number | boolean | ((failureCount: number, error: any) => boolean);
      };
    };
  }
  
  export class QueryClient {
    constructor(config?: QueryClientConfig);
  }
  
  export interface QueryClientProviderProps {
    client: QueryClient;
    children: React.ReactNode;
  }
  
  export function QueryClientProvider(props: QueryClientProviderProps): JSX.Element;
}

declare module 'chess.js' {
  export class Chess {
    constructor(fen?: string);
    
    // Game methods
    fen(): string;
    game_over(): boolean;
    in_check(): boolean;
    in_checkmate(): boolean;
    in_draw(): boolean;
    in_stalemate(): boolean;
    in_threefold_repetition(): boolean;
    insufficient_material(): boolean;
    
    // Move methods
    move(move: string | { from: string; to: string; promotion?: string }): any;
    reset(): void;
    
    // Other methods
    history(): string[];
    load(fen: string): boolean;
    
    // Position inquiry
    get(square: string): any;
    moves(options?: { square?: string; verbose?: boolean }): any[];
  }
  
  export type Square = string;
} 
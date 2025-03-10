declare module 'chessground' {
  export function Chessground(element: HTMLElement, config?: any): Api;
  export interface Api {
    set(config: any): void;
    state: any;
    getFen(): string;
    toggleOrientation(): void;
    setShapes(shapes: any[]): void;
    destroy(): void;
  }
}

declare module 'chessground/api' {
  export interface Api {
    set(config: any): void;
    state: any;
    getFen(): string;
    toggleOrientation(): void;
    setShapes(shapes: any[]): void;
    destroy(): void;
  }
}

declare module 'chessground/config' {
  export interface Config {
    fen?: string;
    orientation?: string;
    turnColor?: string;
    check?: boolean | string;
    lastMove?: string[];
    selected?: string;
    coordinates?: boolean;
    autoCastle?: boolean;
    viewOnly?: boolean;
    disableContextMenu?: boolean;
    resizable?: boolean;
    addPieceZIndex?: boolean;
    highlight?: {
      lastMove?: boolean;
      check?: boolean;
    };
    animation?: {
      enabled?: boolean;
      duration?: number;
    };
    movable?: {
      free?: boolean;
      color?: string | boolean;
      dests?: Map<string, string[]>;
      showDests?: boolean;
      events?: {
        after?: (orig: string, dest: string, metadata: any) => void;
        afterNewPiece?: (role: string, pos: string, metadata?: any) => void;
      };
      rookCastle?: boolean;
    };
    premovable?: {
      enabled?: boolean;
      showDests?: boolean;
      castle?: boolean;
      dests?: string[];
      events?: {
        set?: (orig: string, dest: string, metadata?: any) => void;
        unset?: () => void;
      };
    };
    draggable?: {
      enabled?: boolean;
      distance?: number;
      autoDistance?: boolean;
      showGhost?: boolean;
      deleteOnDropOff?: boolean;
    };
    selectable?: {
      enabled?: boolean;
    };
    events?: {
      change?: () => void;
      move?: (orig: string, dest: string, capturedPiece?: any) => void;
      dropNewPiece?: (piece: any, pos: string) => void;
      select?: (key: string) => void;
    };
    drawable?: {
      enabled?: boolean;
      visible?: boolean;
      defaultSnapToValidMove?: boolean;
      shapes?: any[];
      autoShapes?: any[];
      brushes?: any;
      pieces?: {
        baseUrl?: string;
      };
    };
  }
}

declare module 'chessground/types' {
  export type Color = 'white' | 'black';
  export type Key = string;
}

declare module 'chess.js' {
  export class Chess {
    constructor(fen?: string);
    load(fen: string): boolean;
    fen(): string;
    move(move: string | { from: string; to: string; promotion?: string }): { color: string; from: string; to: string; flags: string; piece: string; san: string } | null;
    moves(options?: { square?: string; verbose?: boolean }): string[] | any[];
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    insufficient_material(): boolean;
    in_threefold_repetition(): boolean;
    game_over(): boolean;
    validate_fen(fen: string): { valid: boolean; error_number: number; error: string };
    turn(): string;
    undo(): { color: string; from: string; to: string; flags: string; piece: string; san: string } | null;
  }
  
  export type Square = string;
} 
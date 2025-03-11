declare module 'chessground' {
  import { Api } from 'chessground/api';
  import { Config } from 'chessground/config';
  
  export function Chessground(element: HTMLElement | null, config?: Config): Api;
}

declare module 'chessground/api' {
  import { Config } from 'chessground/config';
  import { Key, FEN, Color } from 'chessground/types';
  
  export interface Api {
    set(config: Config): void;
    state: any;
    getFen(): FEN;
    getOrientation(): Color;
    destroy(): void;
    redrawAll(): void;
    toggleOrientation(): void;
    setPieces(pieces: any): void;
    selectSquare(key: Key | null, force?: boolean): void;
    move(orig: Key, dest: Key): void;
    newPiece(piece: any, key: Key): void;
    playPremove(): boolean;
    cancelPremove(): void;
    cancelMove(): void;
    stop(): void;
    explode(keys: Key[]): void;
    setShapes(shapes: any[]): void;
    setAutoShapes(shapes: any[]): void;
  }
}

declare module 'chessground/config' {
  import { Key, Color } from 'chessground/types';
  
  export interface Config {
    fen?: string;
    orientation?: Color;
    turnColor?: Color;
    check?: Color | boolean;
    lastMove?: Key[];
    selected?: Key;
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
      color?: Color | 'both' | undefined;
      dests?: Map<Key, Key[]>;
      showDests?: boolean;
      events?: {
        after?: (orig: Key, dest: Key, metadata: any) => void;
        afterNewPiece?: (role: string, key: Key, metadata: any) => void;
      };
      rookCastle?: boolean;
    };
    premovable?: {
      enabled?: boolean;
      showDests?: boolean;
      castle?: boolean;
      dests?: Key[];
      events?: {
        set?: (orig: Key, dest: Key, metadata?: any) => void;
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
      move?: (orig: Key, dest: Key, capturedPiece?: any) => void;
      dropNewPiece?: (piece: any, key: Key) => void;
      select?: (key: Key) => void;
    };
    drawable?: {
      enabled?: boolean;
      visible?: boolean;
      defaultSnapToValidMove?: boolean;
      eraseOnClick?: boolean;
      shapes?: any[];
      autoShapes?: any[];
      brushes?: any;
      pieces?: {
        baseUrl?: string;
      };
      onChange?: (shapes: any[]) => void;
    };
  }
}

declare module 'chessground/types' {
  export type Color = 'white' | 'black';
  export type Key = string;
  export type FEN = string;
  export type Piece = {
    role: string;
    color: Color;
  };
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
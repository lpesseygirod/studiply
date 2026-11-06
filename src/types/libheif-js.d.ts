/**
 * libheif-js 1.23.5 (LGPL-3.0; Lea's advisor, 6 Nov): only what the web's toJpeg uses to decode a HEIC
 * (src/utils/toJpeg.web.ts). Its bundled build (the WebAssembly inside the JavaScript) exports the
 * library ready to use.
 */
declare module 'libheif-js/wasm-bundle' {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    /** Fills `target` (RGBA) with the picture; the callback gets it back, or null when it fails. */
    display(target: ImageData, done: (shown: ImageData | null) => void): void;
    free?(): void;
  }
  export class HeifDecoder {
    decode(data: Uint8Array | ArrayBuffer): HeifImage[];
  }
}

// noVNC ships plain JavaScript with no types, so this declares the part the computer page uses.
declare module '@novnc/novnc' {
  interface RFBOptions {
    readonly shared?: boolean;
  }

  interface Viewer extends EventTarget {
    viewOnly: boolean;
    scaleViewport: boolean;
    clipViewport: boolean;
    resizeSession: boolean;
    focusOnClick: boolean;
    background: string;

    disconnect: () => void;
    focus: () => void;
    blur: () => void;
    clipboardPasteFrom: (text: string) => void;
    sendKey: (keysym: number, code: string, down?: boolean) => void;
  }

  const RFB: new (target: HTMLElement, channel: WebSocket, options?: RFBOptions) => Viewer;

  export default RFB;
}

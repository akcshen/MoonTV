declare module 'mux.js' {
  export interface MuxTransmuxerData {
    initSegment?: Uint8Array;
    data: Uint8Array;
  }

  export interface MuxTransmuxer {
    on(event: 'data', listener: (data: MuxTransmuxerData) => void): void;
    setBaseMediaDecodeTime(time: number): void;
    push(data: Uint8Array): void;
    flush(): void;
  }

  export interface MuxMp4Module {
    Transmuxer: new () => MuxTransmuxer;
  }

  interface MuxJs {
    mp4: MuxMp4Module;
  }

  const muxjs: MuxJs;
  export = muxjs;
}

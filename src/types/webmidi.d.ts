// Web MIDI API Type Definitions

declare namespace WebMidi {
  interface MIDIOptions {
    sysex?: boolean;
    software?: boolean;
  }

  interface MIDIAccess extends EventTarget {
    readonly inputs: MIDIInputMap;
    readonly outputs: MIDIOutputMap;
    readonly sysexEnabled: boolean;
    onstatechange: ((this: MIDIAccess, ev: MIDIConnectionEvent) => void) | null;
  }

  interface MIDIInputMap {
    readonly size: number;
    forEach(callback: (value: MIDIInput, key: string, map: MIDIInputMap) => void): void;
    get(id: string): MIDIInput | undefined;
    has(id: string): boolean;
    keys(): IterableIterator<string>;
    values(): IterableIterator<MIDIInput>;
    entries(): IterableIterator<[string, MIDIInput]>;
    [Symbol.iterator](): IterableIterator<[string, MIDIInput]>;
  }

  interface MIDIOutputMap {
    readonly size: number;
    forEach(callback: (value: MIDIOutput, key: string, map: MIDIOutputMap) => void): void;
    get(id: string): MIDIOutput | undefined;
    has(id: string): boolean;
    keys(): IterableIterator<string>;
    values(): IterableIterator<MIDIOutput>;
    entries(): IterableIterator<[string, MIDIOutput]>;
    [Symbol.iterator](): IterableIterator<[string, MIDIOutput]>;
  }

  interface MIDIPort extends EventTarget {
    readonly id: string;
    readonly manufacturer: string | null;
    readonly name: string | null;
    readonly type: MIDIPortType;
    readonly version: string | null;
    readonly state: MIDIPortDeviceState;
    readonly connection: MIDIPortConnectionState;
    onstatechange: ((this: MIDIPort, ev: MIDIConnectionEvent) => void) | null;
    open(): Promise<MIDIPort>;
    close(): Promise<MIDIPort>;
  }

  interface MIDIInput extends MIDIPort {
    readonly type: 'input';
    onmidimessage: ((this: MIDIInput, ev: MIDIMessageEvent) => void) | null;
  }

  interface MIDIOutput extends MIDIPort {
    readonly type: 'output';
    send(data: number[] | Uint8Array, timestamp?: number): void;
    clear(): void;
  }

  interface MIDIMessageEvent extends Event {
    readonly data: Uint8Array;
  }

  interface MIDIConnectionEvent extends Event {
    readonly port: MIDIPort;
  }

  type MIDIPortType = 'input' | 'output';
  type MIDIPortDeviceState = 'disconnected' | 'connected';
  type MIDIPortConnectionState = 'open' | 'closed' | 'pending';
}

interface Navigator {
  requestMIDIAccess(options?: WebMidi.MIDIOptions): Promise<WebMidi.MIDIAccess>;
}

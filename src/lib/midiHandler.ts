import type { MidiMessage } from './logicArticulationParser';

export interface MidiOutput {
  id: string;
  name: string;
  manufacturer: string;
  output: WebMidi.MIDIOutput | null;
}

export interface MidiState {
  isSupported: boolean;
  isConnected: boolean;
  outputs: MidiOutput[];
  selectedOutputId: string | null;
  error: string | null;
  useWebSocket: boolean;
  webSocketPort?: string;
}

export type TrackNameCallback = (trackName: string) => void;
export type ArticulationSetCallback = (articulationSetId: number) => void;

const MIDI_OUTPUT_STORAGE_KEY = 'logic-remote-midi-output';
const WS_PORT = 3001;

class MidiHandler {
  private midiAccess: WebMidi.MIDIAccess | null = null;
  private selectedOutput: WebMidi.MIDIOutput | null = null;
  private listeners: Set<(state: MidiState) => void> = new Set();
  private trackNameListeners: Set<TrackNameCallback> = new Set();
  private articulationSetListeners: Set<ArticulationSetCallback> = new Set();
  private channel: number = 0;

  private webSocket: WebSocket | null = null;
  private useWebSocket: boolean = false;
  private wsPortName: string = '';
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(): Promise<MidiState> {
    // Try Web MIDI first
    if (navigator.requestMIDIAccess) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

        this.midiAccess.onstatechange = () => {
          this.notifyListeners();
        };

        this.autoSelectOutput();

        console.log('[MIDI] Web MIDI initialized');

        // Also connect WebSocket for receiving track names from LogicTrackMonitor
        this.connectWebSocket();

        return this.getState();
      } catch (error) {
        console.warn('[MIDI] Web MIDI failed:', error);
      }
    }

    // Fallback to WebSocket only
    console.log('[MIDI] Web MIDI not available, using WebSocket...');
    return this.initWebSocketOnly();
  }

  private connectWebSocket(): void {
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `ws://${wsHost}:${WS_PORT}`;

    console.log(`[MIDI] Connecting WebSocket: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[MIDI] WebSocket connected');
        this.webSocket = ws;
        this.notifyListeners(); // Update UI
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'trackChange' && msg.trackName) {
            console.log(`[MIDI] Track changed: "${msg.trackName}"`);
            this.trackNameListeners.forEach(cb => cb(msg.trackName));
          } else if (msg.type === 'articulationSetChange' && msg.articulationSetId !== undefined) {
            console.log(`[MIDI] Articulation set changed: ID ${msg.articulationSetId}`);
            this.articulationSetListeners.forEach(cb => cb(msg.articulationSetId));
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        console.log('[MIDI] WebSocket error (midi-server may not be running)');
      };

      ws.onclose = () => {
        this.webSocket = null;
        this.notifyListeners(); // Update UI
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (e) {
      console.log('[MIDI] Could not create WebSocket');
    }
  }

  private async initWebSocketOnly(): Promise<MidiState> {
    return new Promise((resolve) => {
      const wsHost = window.location.hostname || 'localhost';
      const wsUrl = `ws://${wsHost}:${WS_PORT}`;

      console.log(`[MIDI] Connecting to WebSocket: ${wsUrl}`);

      try {
        this.webSocket = new WebSocket(wsUrl);

        this.webSocket.onopen = () => {
          console.log('[MIDI] WebSocket connected');
          this.useWebSocket = true;
          setTimeout(() => {
            if (this.webSocket?.readyState === WebSocket.OPEN) {
              this.webSocket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 100);
        };

        this.webSocket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'connected' || msg.type === 'pong') {
              this.wsPortName = msg.port || 'MIDI Bridge';
              this.notifyListeners();
              resolve(this.getState());
            } else if (msg.type === 'trackChange' && msg.trackName) {
              console.log(`[MIDI] Track changed: "${msg.trackName}"`);
              this.trackNameListeners.forEach(cb => cb(msg.trackName));
            } else if (msg.type === 'articulationSetChange' && msg.articulationSetId !== undefined) {
              console.log(`[MIDI] Articulation set changed: ID ${msg.articulationSetId}`);
              this.articulationSetListeners.forEach(cb => cb(msg.articulationSetId));
            }
          } catch (e) {
            console.error('[MIDI] WebSocket message error:', e);
          }
        };

        this.webSocket.onerror = () => {
          console.error('[MIDI] WebSocket error');
          this.useWebSocket = false;
          resolve(this.getState({ error: 'MIDI Bridge not running. Start with: node midi-server.js' }));
        };

        this.webSocket.onclose = () => {
          console.log('[MIDI] WebSocket closed');
          this.useWebSocket = false;
          this.wsPortName = '';
          this.notifyListeners();

          if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = setTimeout(() => {
            console.log('[MIDI] Attempting WebSocket reconnect...');
            this.initWebSocketOnly();
          }, 3000);
        };

        setTimeout(() => {
          if (!this.useWebSocket) {
            resolve(this.getState({ error: 'MIDI Bridge not running. Start with: node midi-server.js' }));
          }
        }, 2000);
      } catch (e) {
        console.error('[MIDI] WebSocket creation failed:', e);
        resolve(this.getState({ error: 'Failed to create WebSocket connection' }));
      }
    });
  }

  private autoSelectOutput(): void {
    if (!this.midiAccess) return;

    const allOutputs: WebMidi.MIDIOutput[] = [];
    try {
      if (typeof this.midiAccess.outputs.forEach === 'function') {
        this.midiAccess.outputs.forEach((output: WebMidi.MIDIOutput) => {
          if (output) allOutputs.push(output);
        });
      }
    } catch (e) {
      console.error('[MIDI] Error collecting outputs:', e);
    }

    // Try to restore from localStorage
    const savedOutputId = localStorage.getItem(MIDI_OUTPUT_STORAGE_KEY);
    if (savedOutputId) {
      const savedOutput = allOutputs.find(o => o.id === savedOutputId);
      if (savedOutput) {
        this.selectedOutput = savedOutput;
        console.log(`[MIDI] Restored output: ${savedOutput.name}`);
        return;
      }
    }

    // Auto-select IAC Driver (macOS) for Logic Pro
    const preferredNames = ['IAC Driver', 'Browser to Logic', 'loopMIDI', 'Session'];

    for (const preferredName of preferredNames) {
      const match = allOutputs.find(output =>
        output.name?.toLowerCase().includes(preferredName.toLowerCase())
      );
      if (match) {
        this.selectedOutput = match;
        localStorage.setItem(MIDI_OUTPUT_STORAGE_KEY, match.id);
        console.log(`[MIDI] Auto-selected output: ${match.name}`);
        return;
      }
    }
  }

  getState(overrides: Partial<MidiState> = {}): MidiState {
    const outputs: MidiOutput[] = [];

    if (this.midiAccess) {
      try {
        if (typeof this.midiAccess.outputs.forEach === 'function') {
          this.midiAccess.outputs.forEach((output: WebMidi.MIDIOutput) => {
            if (output && output.id) {
              outputs.push({
                id: output.id,
                name: output.name || 'Unknown Device',
                manufacturer: output.manufacturer || 'Unknown',
                output,
              });
            }
          });
        }
      } catch (e) {
        console.error('[MIDI] Error iterating outputs:', e);
      }
    }

    // Add WebSocket as an output option
    if (this.useWebSocket) {
      outputs.unshift({
        id: 'websocket-bridge',
        name: `MIDI Bridge (${this.wsPortName})`,
        manufacturer: 'WebSocket',
        output: null,
      });
    }

    // Connected if WebSocket is open (preferred) OR Web MIDI output is connected
    const wsConnected = this.webSocket?.readyState === WebSocket.OPEN;
    const midiConnected = this.selectedOutput !== null && this.selectedOutput.state === 'connected';
    const isConnected = wsConnected || midiConnected;

    return {
      isSupported: !!navigator.requestMIDIAccess || this.useWebSocket,
      isConnected,
      outputs,
      selectedOutputId: this.useWebSocket ? 'websocket-bridge' : (this.selectedOutput?.id || null),
      error: null,
      useWebSocket: this.useWebSocket,
      webSocketPort: this.wsPortName,
      ...overrides,
    };
  }

  selectOutput(outputId: string): boolean {
    if (!this.midiAccess) return false;

    let foundOutput: WebMidi.MIDIOutput | null = null;
    try {
      if (typeof this.midiAccess.outputs.forEach === 'function') {
        this.midiAccess.outputs.forEach((output: WebMidi.MIDIOutput) => {
          if (output && output.id === outputId) foundOutput = output;
        });
      }
    } catch (e) {
      console.error('[MIDI] Error finding output:', e);
    }

    if (foundOutput) {
      this.selectedOutput = foundOutput;
      localStorage.setItem(MIDI_OUTPUT_STORAGE_KEY, outputId);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  onTrackName(callback: TrackNameCallback): () => void {
    this.trackNameListeners.add(callback);
    return () => this.trackNameListeners.delete(callback);
  }

  onArticulationSetChange(callback: ArticulationSetCallback): () => void {
    this.articulationSetListeners.add(callback);
    return () => this.articulationSetListeners.delete(callback);
  }

  setChannel(channel: number): void {
    this.channel = Math.max(0, Math.min(15, channel));
  }

  getChannel(): number {
    return this.channel;
  }

  sendMessages(messages: MidiMessage[], useGlobalChannel: boolean = true): boolean {
    console.log(`[MIDI] sendMessages called, webSocket exists: ${!!this.webSocket}, readyState: ${this.webSocket?.readyState}, OPEN=${WebSocket.OPEN}`);

    // Prefer WebSocket if connected (midi-server handles the actual MIDI output)
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      for (const msg of messages) {
        let status = msg.status;
        if (useGlobalChannel && status >= 128 && status < 240) {
          const messageType = status & 0xF0;
          status = messageType | this.channel;
        }

        console.log(`[MIDI] Sending via WebSocket: [${status}, ${msg.data1}, ${msg.data2}]`);
        this.webSocket.send(JSON.stringify({
          type: 'midi',
          status,
          data1: msg.data1,
          data2: msg.data2
        }));
      }
      return true;
    }

    // Fall back to Web MIDI
    if (!this.selectedOutput) {
      console.warn('[MIDI] No MIDI output selected');
      return false;
    }

    for (const msg of messages) {
      try {
        let status = msg.status;
        if (useGlobalChannel && status >= 128 && status < 240) {
          const messageType = status & 0xF0;
          status = messageType | this.channel;
        }

        const midiData = [status, msg.data1, msg.data2];
        console.log(`[MIDI] Sending: [${midiData.join(', ')}]`);
        this.selectedOutput.send(midiData);
      } catch (error) {
        console.error('[MIDI] Send error:', error);
        return false;
      }
    }
    return true;
  }

  sendNoteOn(note: number, velocity: number = 127): boolean {
    return this.sendMessages([{
      status: 0x90,
      data1: note,
      data2: velocity,
    }]);
  }

  sendNoteOff(note: number): boolean {
    return this.sendMessages([{
      status: 0x80,
      data1: note,
      data2: 0,
    }]);
  }

  sendCC(cc: number, value: number): boolean {
    return this.sendMessages([{
      status: 0xB0,
      data1: cc,
      data2: value,
    }]);
  }

  subscribe(listener: (state: MidiState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }
}

export const midiHandler = new MidiHandler();

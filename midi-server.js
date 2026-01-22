#!/usr/bin/env node
/**
 * MIDI Bridge Server for Logic Pro
 *
 * Bidirectional MIDI bridge between browser/iPad and Logic Pro:
 * - Receives MIDI from browser via WebSocket → sends to Logic via IAC Driver
 * - Receives track name from LogicTrackMonitor Swift app → sends to browser via WebSocket
 *
 * Usage: node midi-server.js
 */

const WebSocket = require('ws');
const JZZ = require('jzz');
const os = require('os');

const WS_PORT = 3001;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// MIDI ports
let midiOut = null;      // Output to Logic (IAC Driver)
let midiIn = null;       // Input from PlugSearch (for track detection)
let selectedOutPortName = null;
let selectedInPortName = null;

// Connected WebSocket clients
let wsClients = new Set();

// Track source identification
const CLIENT_TYPE = {
  BROWSER: 'browser',
  TRACK_MONITOR: 'track-monitor'
};

// Track the last articulation set ID from PlugSearch
let lastArticulationSetId = null;

// Initialize MIDI
async function initMidi() {
  console.log('\n🎹 Logic Pro MIDI Bridge Server');
  console.log('================================\n');

  const info = JZZ().info();
  const outputs = info.outputs;
  const inputs = info.inputs;

  // List available MIDI ports
  console.log('Available MIDI outputs:');
  outputs.forEach((port, i) => {
    console.log(`  ${i + 1}. ${port.name}`);
  });
  console.log('');

  console.log('Available MIDI inputs:');
  inputs.forEach((port, i) => {
    console.log(`  ${i + 1}. ${port.name}`);
  });
  console.log('');

  // --- Set up OUTPUT (Browser → Logic) ---
  // Logic uses IAC Driver on macOS - works with any IAC port name
  const preferredOutNames = ['Browser to Cubase', 'Browser to Logic', 'IAC Driver', 'ArticulationRemote', 'loopMIDI'];

  for (const preferred of preferredOutNames) {
    const found = outputs.find(p => p.name.toLowerCase().includes(preferred.toLowerCase()));
    if (found) {
      selectedOutPortName = found.name;
      break;
    }
  }

  if (selectedOutPortName) {
    try {
      midiOut = JZZ().openMidiOut(selectedOutPortName);
      console.log(`✅ Output: ${selectedOutPortName} (Browser → Logic)`);
    } catch (e) {
      console.error(`❌ Failed to open MIDI output: ${e.message}`);
    }
  } else {
    console.log('⚠️  No IAC Driver found - enable it in Audio MIDI Setup');
  }

  // --- Set up INPUT (PlugSearch → us) ---
  // Try to listen on PlugSearch port to intercept track change info
  const preferredInNames = ['PlugSearch', 'MetaGrid', 'IAC Driver', 'Browser to Cubase'];

  for (const preferred of preferredInNames) {
    const found = inputs.find(p => p.name.toLowerCase().includes(preferred.toLowerCase()));
    if (found) {
      selectedInPortName = found.name;
      break;
    }
  }

  // Listen on ALL available MIDI inputs to find any track change signals
  const allMidiIns = [];
  for (const inputPort of inputs) {
    try {
      const portIn = JZZ().openMidiIn(inputPort.name);
      allMidiIns.push({ name: inputPort.name, port: portIn });
      console.log(`✅ Listening on: ${inputPort.name}`);
    } catch (e) {
      console.log(`   Skipped: ${inputPort.name} (${e.message})`);
    }
  }

  // Connect listeners to all ports
  for (const { name, port } of allMidiIns) {
    port.connect(function(msg) {
      const bytes = [];
      for (let i = 0; i < msg.length; i++) {
        bytes.push(msg[i]);
      }

      const status = bytes[0];
      const type = status & 0xF0;

      // Check for PlugSearch PolyPressure messages (articulation set changes)
      // Format: [0xA0, note=127, pressure=articulationSetId]
      if (name === 'PlugSearch' && type === 0xA0 && bytes[1] === 127) {
        const articulationSetId = bytes[2];
        if (articulationSetId !== lastArticulationSetId) {
          lastArticulationSetId = articulationSetId;
          console.log(`🎼 PlugSearch: Articulation Set ID changed to ${articulationSetId}`);
          broadcastArticulationSetChange(articulationSetId);
        }
      } else {
        // Log other messages for debugging
        console.log(`📥 [${name}]: [${bytes.join(', ')}] - ${describeMidi(bytes)}`);
      }
    });
  }

  console.log(`\n📡 Listening on ${allMidiIns.length} MIDI inputs for track change signals...`);

  console.log('');
}

// Describe MIDI message type
function describeMidi(bytes) {
  if (!bytes || bytes.length === 0) return 'empty';
  const status = bytes[0];
  const channel = (status & 0x0F) + 1;
  const type = status & 0xF0;

  switch (type) {
    case 0x80: return `Note Off ch${channel} note=${bytes[1]} vel=${bytes[2]}`;
    case 0x90: return bytes[2] > 0 ? `Note On ch${channel} note=${bytes[1]} vel=${bytes[2]}` : `Note Off ch${channel} note=${bytes[1]}`;
    case 0xA0: return `Poly Pressure ch${channel} note=${bytes[1]} pressure=${bytes[2]}`;
    case 0xB0: return `CC ch${channel} cc=${bytes[1]} val=${bytes[2]}`;
    case 0xC0: return `Program Change ch${channel} program=${bytes[1]}`;
    case 0xD0: return `Channel Pressure ch${channel} pressure=${bytes[1]}`;
    case 0xE0: return `Pitch Bend ch${channel}`;
    case 0xF0:
      if (status === 0xF0) return 'SysEx Start';
      if (status === 0xF7) return 'SysEx End';
      return `System message 0x${status.toString(16)}`;
    default: return `Unknown 0x${status.toString(16)}`;
  }
}

// Broadcast track name to all browser clients
function broadcastTrackName(trackName) {
  const message = JSON.stringify({
    type: 'trackChange',
    trackName: trackName
  });

  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientType === CLIENT_TYPE.BROWSER) {
      client.send(message);
      console.log(`📤 Sent track name to browser: "${trackName}"`);
    }
  });
}

// Broadcast articulation set change from PlugSearch to all browser clients
function broadcastArticulationSetChange(articulationSetId) {
  const message = JSON.stringify({
    type: 'articulationSetChange',
    articulationSetId: articulationSetId
  });

  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientType === CLIENT_TYPE.BROWSER) {
      client.send(message);
      console.log(`📤 Sent articulation set ID to browser: ${articulationSetId}`);
    }
  });
}

// Send MIDI message to Logic
function sendMidi(status, data1, data2) {
  const msg = [status, data1, data2];
  console.log(`🎵 MIDI Out: [${msg.join(', ')}]`);

  if (midiOut) {
    try {
      midiOut.send(msg);
    } catch (e) {
      console.error(`   Error: ${e.message}`);
    }
  }
}

// Start WebSocket server
function startServer() {
  const wss = new WebSocket.Server({ port: WS_PORT });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`📱 Client connected: ${clientIp}`);

    // Default to browser client until identified
    ws.clientType = CLIENT_TYPE.BROWSER;

    // Track this client for broadcasting
    wsClients.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'midi') {
          // MIDI message from browser - send to Logic
          sendMidi(msg.status, msg.data1, msg.data2);
        } else if (msg.type === 'ping') {
          // Browser ping - respond with status
          ws.send(JSON.stringify({ type: 'pong', port: selectedOutPortName }));
        } else if (msg.type === 'identify') {
          // Client identifying itself
          if (msg.clientType === 'track-monitor') {
            ws.clientType = CLIENT_TYPE.TRACK_MONITOR;
            console.log('🖥️  LogicTrackMonitor connected');
          }
        } else if (msg.type === 'trackChange') {
          // Track change from LogicTrackMonitor Swift app
          console.log(`📥 Track changed: "${msg.trackName}"`);
          broadcastTrackName(msg.trackName);
        }
      } catch (e) {
        console.error('Invalid message:', e.message);
      }
    });

    ws.on('close', () => {
      console.log(`📱 Client disconnected: ${clientIp}`);
      wsClients.delete(ws);
    });

    // Send current status
    ws.send(JSON.stringify({
      type: 'connected',
      port: selectedOutPortName,
      status: midiOut ? 'ready' : 'no-midi',
      trackSwitching: true // Always enabled - Swift app handles this
    }));
  });

  const localIP = getLocalIP();
  console.log(`🌐 WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log(`\n📱 On your iPad, open: http://${localIP}:3000`);
  console.log('   The app will automatically connect to this MIDI bridge.');
  console.log('\n🖥️  Run LogicTrackMonitor app for automatic track switching');
  console.log('');
}

// Main
async function main() {
  await initMidi();
  startServer();
}

main().catch(console.error);

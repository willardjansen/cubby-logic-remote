#!/usr/bin/env node
/**
 * MIDI Bridge Server for Logic Pro
 *
 * Bidirectional MIDI bridge between browser/iPad and Logic Pro:
 * - Receives MIDI from browser via WebSocket → sends to Logic via IAC Driver
 * - Receives track name from LogicTrackMonitor Swift app → sends to browser via WebSocket
 *
 * Usage: node midi-server.js [port]
 *
 * If port is not specified, it will auto-find an available port starting from 7101.
 * Avoids macOS reserved ports (5000, 7000 used by AirPlay).
 */

const WebSocket = require('ws');
const JZZ = require('jzz');
const midi = require('midi');
const os = require('os');
const net = require('net');

// Default port - can be overridden by command line arg or auto-detected
const DEFAULT_WS_PORT = 7101;

// Ports to avoid on macOS (used by system services)
const MACOS_RESERVED_PORTS = [3000, 5000, 7000];

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

// Find an available port
async function findAvailablePort(startPort, maxAttempts = 10) {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i++) {
    while (MACOS_RESERVED_PORTS.includes(port)) {
      port++;
    }
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  throw new Error(`Could not find available port after ${maxAttempts} attempts`);
}

// Will be set after finding available port
let WS_PORT = DEFAULT_WS_PORT;

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

  // Use 'midi' package for output (more reliable in Electron than JZZ)
  const midiOutput = new midi.Output();
  const outputCount = midiOutput.getPortCount();

  // List available MIDI ports using midi package
  console.log('Available MIDI outputs:');
  for (let i = 0; i < outputCount; i++) {
    console.log(`  ${i}: ${midiOutput.getPortName(i)}`);
  }
  console.log('');

  // Still use JZZ for inputs (works for listening)
  const info = JZZ().info();
  const inputs = info.inputs;

  console.log('Available MIDI inputs:');
  inputs.forEach((port, i) => {
    console.log(`  ${i + 1}. ${port.name}`);
  });
  console.log('');

  // --- Set up OUTPUT (Browser → Logic) using midi package ---
  // Logic uses IAC Driver on macOS - works with any IAC port name
  const preferredOutNames = ['Browser to Cubase', 'Browser to Logic', 'IAC Driver', 'ArticulationRemote', 'loopMIDI'];
  let outputPortIndex = -1;

  for (const preferred of preferredOutNames) {
    for (let i = 0; i < outputCount; i++) {
      if (midiOutput.getPortName(i).toLowerCase().includes(preferred.toLowerCase())) {
        outputPortIndex = i;
        selectedOutPortName = midiOutput.getPortName(i);
        break;
      }
    }
    if (outputPortIndex >= 0) break;
  }

  if (outputPortIndex >= 0) {
    try {
      midiOutput.openPort(outputPortIndex);
      midiOut = midiOutput;
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
      midiOut.sendMessage(msg);
    } catch (e) {
      console.error(`   Error: ${e.message}`);
    }
  } else {
    console.warn('   ⚠️ No MIDI output - message not sent');
  }
}

// Start WebSocket server
function startServer() {
  return new Promise((resolve, reject) => {
    const wss = new WebSocket.Server({ port: WS_PORT });

    wss.on('error', (err) => {
      reject(err);
    });

    wss.on('listening', () => {
      resolve(wss);
    });

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
            // Browser ping - respond with status and port
            ws.send(JSON.stringify({ type: 'pong', port: selectedOutPortName, wsPort: WS_PORT }));
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

      // Send current status including the actual WebSocket port
      ws.send(JSON.stringify({
        type: 'connected',
        port: selectedOutPortName,
        status: midiOut ? 'ready' : 'no-midi',
        trackSwitching: true, // Always enabled - Swift app handles this
        wsPort: WS_PORT
      }));
    });

    const localIP = getLocalIP();
    // Output port in a parseable format
    console.log(`MIDI_SERVER_PORT=${WS_PORT}`);
    console.log(`🌐 WebSocket server running on ws://localhost:${WS_PORT}`);
    console.log(`\n📱 On your iPad, open: http://${localIP}:7100`);
    console.log('   The app will automatically connect to this MIDI bridge.');
    console.log('\n🖥️  Run LogicTrackMonitor app for automatic track switching');
    console.log('');
  });
}

// Main
async function main() {
  // Check for port argument
  const portArg = process.argv[2];
  if (portArg) {
    WS_PORT = parseInt(portArg, 10);
    if (isNaN(WS_PORT)) {
      console.error('Invalid port argument');
      process.exit(1);
    }
  } else {
    // Auto-find available port
    try {
      WS_PORT = await findAvailablePort(DEFAULT_WS_PORT);
      if (WS_PORT !== DEFAULT_WS_PORT) {
        console.log(`ℹ️  Port ${DEFAULT_WS_PORT} was busy, using port ${WS_PORT}`);
      }
    } catch (err) {
      console.error('Failed to find available port:', err.message);
      process.exit(1);
    }
  }

  await initMidi();

  try {
    await startServer();
  } catch (err) {
    console.error(`Failed to start WebSocket server on port ${WS_PORT}:`, err.message);
    process.exit(1);
  }
}

main().catch(console.error);

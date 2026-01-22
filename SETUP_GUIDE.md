# Logic Pro Articulation Remote - Setup Guide

This guide walks you through setting up the Logic Pro Articulation Remote system.

---

## Prerequisites

- **macOS** 12.0 or later
- **Logic Pro** 10.7 or later
- **Node.js** 18 or later
- **Art Conductor for Logic** (optional, for articulation library)

---

## Step 1: Enable IAC Driver

The IAC Driver is a virtual MIDI port built into macOS that allows apps to send MIDI to each other.

1. Open **Audio MIDI Setup** (Applications > Utilities)
2. Go to **Window > Show MIDI Studio**
3. Double-click **IAC Driver**
4. Check **Device is online**
5. Add a port named "Browser to Logic" (or use the default)
6. Click **Apply**

---

## Step 2: Configure Logic Pro MIDI Input

1. Open **Logic Pro**
2. Go to **Logic Pro > Settings > MIDI**
3. In the **Inputs** tab, ensure **IAC Driver** is enabled
4. Your instrument tracks should now receive MIDI from the IAC Driver

---

## Step 3: Grant Accessibility Permission

LogicTrackMonitor needs Accessibility permission to detect track selection.

1. Open **System Settings > Privacy & Security > Accessibility**
2. Click the **+** button
3. Navigate to and add: `LogicTrackMonitor/.build/release/LogicTrackMonitor`
4. Ensure the checkbox is enabled

> **Note:** You may need to rebuild LogicTrackMonitor after granting permission.

---

## Step 4: Install Dependencies

```bash
cd /path/to/cubby-logic-remote-midi-script

# Install Node.js dependencies
npm install

# Build the LogicTrackMonitor Swift app
cd LogicTrackMonitor
swift build -c release
cd ..
```

---

## Step 5: Configure Art Conductor (Optional)

If you have Babylonwaves Art Conductor installed, articulation sets will be automatically loaded from:

```
~/Music/Audio Music Apps/Articulation Settings/Art Conductor Logic/
```

The system searches this directory for `.plist` files matching your track names.

---

## Step 6: Start the Services

Open **three terminal windows**:

### Terminal 1: MIDI Bridge Server
```bash
cd /path/to/cubby-logic-remote-midi-script
node midi-server.js
```

You should see:
```
🎹 Logic Pro MIDI Bridge Server
================================
✅ Output: IAC Driver Browser to Logic (Browser → Logic)
🌐 WebSocket server running on ws://localhost:3001
```

### Terminal 2: Web App
```bash
cd /path/to/cubby-logic-remote-midi-script
npm run dev
```

You should see:
```
▲ Next.js 14.x
- Local: http://localhost:3000
✓ Ready
```

### Terminal 3: Track Monitor
```bash
cd /path/to/cubby-logic-remote-midi-script
./LogicTrackMonitor/.build/release/LogicTrackMonitor
```

You should see:
```
✅ Accessibility permission granted
🔍 Starting Logic Pro monitor...
✅ WebSocket connected
✅ Found Logic Pro (PID: xxxxx)
```

---

## Step 7: Open the Web App

### On your Mac:
Open http://localhost:3000 in your browser

### On your iPad (same network):
1. Find your Mac's IP address: **System Settings > Network**
2. Open `http://YOUR_MAC_IP:3000` in Safari

---

## Verification

1. **Logic Pro** is running with a project open
2. **midi-server.js** shows "WebSocket server running"
3. **LogicTrackMonitor** shows "Found Logic Pro"
4. **Web app** shows green "Connected" indicator
5. Click a track in Logic → track name appears in blue badge
6. Articulation buttons appear for that track

---

## Troubleshooting

### "Accessibility permission not granted"
- Open System Settings > Privacy & Security > Accessibility
- Remove and re-add LogicTrackMonitor
- Restart LogicTrackMonitor

### "WebSocket not connected"
- Ensure midi-server.js is running
- Check that port 3001 is not blocked by firewall
- Restart midi-server.js

### "No articulation set found"
- Ensure Art Conductor is installed in the default location
- Check that your track name matches an articulation set name
- Try loading a .plist file manually via Settings

### "MIDI not received in Logic"
- Check IAC Driver is online in Audio MIDI Setup
- Verify Logic's MIDI input settings include IAC Driver
- Check the track is armed for recording or monitoring is on

### iPad can't connect
- Ensure Mac and iPad are on the same network
- Check Mac's firewall allows incoming connections on port 3000
- Try using the Mac's IP address instead of hostname

---

## Auto-Start (Optional)

To start services automatically on login:

### Using launchd (recommended)
Create plist files in `~/Library/LaunchAgents/` for each service.

### Using Login Items
Add terminal commands to System Settings > General > Login Items

---

## Updating

```bash
cd /path/to/cubby-logic-remote-midi-script
git pull
npm install
cd LogicTrackMonitor && swift build -c release && cd ..
```

Then restart all three services.

# Logic Pro Articulation Remote - User Guide

This guide explains how to use the Logic Pro Articulation Remote after setup is complete.

---

## Quick Start

1. Start all three services (midi-server, web app, LogicTrackMonitor)
2. Open Logic Pro with a project
3. Open the web app at http://localhost:3000
4. Select a track in Logic Pro
5. Matching articulations appear automatically
6. Tap buttons to send keyswitches to Logic

---

## Interface Overview

### Header Bar

| Element | Description |
|---------|-------------|
| **Connection indicator** | Green dot = connected, Red dot = disconnected |
| **Track badge** | Blue badge showing the currently selected Logic Pro track |
| **Art ID badge** | Green badge showing PlugSearch articulation ID (if using MetaServer) |
| **Settings button** | Gear icon to open settings panel |

### Articulation Grid

The main area displays articulation buttons in a responsive grid:

- **Button colors** match Logic Pro's articulation colors
- **Button text** shows the articulation name
- **Tap/click** sends the corresponding MIDI keyswitch

---

## Automatic Track Detection

When you select a track in Logic Pro, the system automatically:

1. Detects the track name via LogicTrackMonitor
2. Searches your Art Conductor library for a matching articulation set
3. Loads and displays the articulations

**Track names are matched flexibly:**
- Partial matches work (e.g., track "Violin 1" matches "Stradivari Violin")
- Case-insensitive matching
- Best match is selected from multiple results

---

## Settings Panel

Click the gear icon to access settings:

### Columns
Adjust the number of columns in the articulation grid (3, 4, 5, or 6).

### Load Articulation Set
Manually load a .plist file if automatic detection doesn't find your set:
- Click "Choose File"
- Select a Logic Pro Articulation Set (.plist)
- The set loads immediately

### Loaded Sets
Shows all articulation sets loaded in the current session:
- Click a set name to switch to it
- Useful when working with multiple instruments

### MIDI Output
Select which MIDI output to use (only shown when Web MIDI is available).

---

## Using on iPad

### Connecting

1. Find your Mac's IP address (System Settings > Network)
2. Open Safari on iPad
3. Navigate to `http://YOUR_MAC_IP:3000`
4. Add to Home Screen for app-like experience

### Tips for iPad

- Use landscape orientation for more columns
- Adjust column count in Settings for your screen size
- Position iPad above or beside your keyboard for easy access

---

## Drag and Drop

You can drag .plist files directly onto the web app to load them:

1. Open Finder and navigate to your articulation sets
2. Drag a .plist file onto the web app window
3. The set loads automatically

---

## Supported MIDI Message Types

The system supports all Logic Pro articulation trigger types:

| Type | Description |
|------|-------------|
| **Note On** | Standard keyswitches (most common) |
| **Control Change** | CC messages for articulation switching |
| **Program Change** | Program/patch changes |

---

## Art Conductor Integration

If you have Babylonwaves Art Conductor installed, the system automatically scans:

```
~/Music/Audio Music Apps/Articulation Settings/Art Conductor Logic/
```

All .plist files in this directory (and subdirectories) are indexed and searchable.

---

## Workflow Tips

### Creating Custom Sets

1. In Logic Pro, create an Articulation Set for your instrument
2. Export it as a .plist file
3. Place it in the Art Conductor directory for auto-detection
4. Or drag it directly onto the web app

### Organizing Your Library

- Name articulation sets to match your track names
- Use consistent naming conventions
- Group related sets in subdirectories

### Multi-Instrument Projects

- Each track change loads the matching set automatically
- Previously loaded sets are cached for instant switching
- Use the "Loaded Sets" panel to manually switch if needed

---

## Status Indicators

### Connection Status

| Status | Meaning |
|--------|---------|
| Green "MIDI Bridge" | Connected via WebSocket to midi-server |
| Green "Connected" | Connected via Web MIDI (browser) |
| Red "Disconnected" | No connection - check midi-server |

### Track Badge

- **Blue badge with track name**: Track detected successfully
- **No badge**: No track detected or Logic Pro not running

---

## Keyboard Shortcuts

Currently, the web app is designed for touch/mouse interaction. For keyboard control, use Logic Pro's built-in articulation shortcuts.

---

## Common Tasks

### Change articulation while playing
1. Keep your instrument track selected in Logic
2. Tap articulation buttons on iPad/browser
3. MIDI keyswitches are sent immediately

### Load a different instrument's articulations
1. Select the track in Logic Pro
2. Wait for automatic detection
3. Or manually load via Settings

### Adjust button layout
1. Click Settings (gear icon)
2. Choose column count (3-6)
3. Settings persist for the session

---

## FAQ

**Q: Why isn't my track being detected?**
A: Ensure LogicTrackMonitor is running and has Accessibility permission. The track must be selected (clicked) in Logic Pro.

**Q: Why are no articulations showing?**
A: The track name may not match any articulation set. Try loading one manually via Settings.

**Q: Can I use this with other DAWs?**
A: No, this system is designed specifically for Logic Pro and uses its Accessibility APIs.

**Q: Does this work over the internet?**
A: No, it's designed for local network use only. The Mac and iPad must be on the same network.

**Q: Can I customize button colors?**
A: Button colors come from the articulation set file. Edit the set in Logic Pro to change colors.

---

## Getting Help

If you encounter issues:

1. Check the Troubleshooting section in SETUP_GUIDE.md
2. Verify all three services are running
3. Check terminal windows for error messages
4. Restart services if connection is lost

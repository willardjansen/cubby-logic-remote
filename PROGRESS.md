# Cubby Logic Remote - Progress Report

**Date:** January 29, 2026
**Status:** ✅ COMPLETE - v1.2.1 Released

---

## 2026-01-29: v1.2.1 - Fixed MIDI Output in Packaged App

### Problem
MIDI output wasn't working in the packaged Electron app - JZZ library returns empty port lists.

### Solution
- Switched from `JZZ` to `midi` package for MIDI output (more reliable in Electron)
- Updated `sendMidi()` to use `midiOut.sendMessage()`
- Added auto port detection to avoid macOS AirPlay ports (3000, 5000, 7000)
- Added README with setup and troubleshooting docs

---

## 2026-01-22: v1.2.0 - Initial Release

**Repository:** https://github.com/willardjansen/cubby-logic-remote

---

## What We Built

A standalone system to control Logic Pro articulations from an iPad/browser:

| Component | Description |
|-----------|-------------|
| **Web App** | Next.js app displaying articulation buttons in a responsive grid |
| **MIDI Bridge** | Node.js WebSocket server bridging browser to Logic via IAC Driver |
| **CubbyLogicMonitor** | Swift app detecting track selection via Accessibility APIs (signed & notarized) |
| **Articulations API** | Scans Art Conductor library and serves matching articulation sets |
| **Articulation Parser** | Parses Logic Pro and Art Conductor .plist formats |

---

## Features ✅

### Track Auto-Detection
- Automatically detects which track is selected in Logic Pro
- Works by reading macOS Accessibility attributes from Logic's UI
- No plugins or Control Surfaces required
- Works independently (no MetaServer/PlugSearch needed)

### Articulation Auto-Loading
- Searches Art Conductor library when track changes
- Automatically loads matching articulation set
- Displays articulations with correct colors and MIDI mappings

### MIDI Output
- Clicking articulation buttons sends MIDI to Logic
- Supports Note On, CC, and Program Change messages
- Routes through IAC Driver virtual MIDI port

### iPad/Mobile Support
- Responsive grid layout
- Connect from any device on local network
- Touch-friendly button sizes

### macOS Distribution
- CubbyLogicMonitor.app is code signed with Developer ID
- Notarized by Apple for Gatekeeper approval
- Ready for distribution without security warnings

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Logic Pro     │────▶│ CubbyLogicMonitor│────▶│  midi-server.js │
│                 │     │   (Swift app)    │     │   (WebSocket)   │
│  Track headers  │     │                  │     │                 │
│  expose names   │     │  Reads AXDesc    │     │  Broadcasts     │
│  via AXDesc     │     │  every 0.3s      │     │  track name     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Logic Pro     │◀────│  midi-server.js  │◀────│   Web App       │
│                 │     │                  │     │   (Next.js)     │
│  Receives MIDI  │     │  Sends MIDI via  │     │                 │
│  key switches   │     │  IAC Driver      │     │  Auto-loads     │
│                 │     │                  │     │  Art Conductor  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Key Technical Discoveries

### Smart Quotes in Logic Pro
Logic Pro's accessibility descriptions use Unicode smart quotes, not ASCII:
- U+201C (") - LEFT DOUBLE QUOTATION MARK
- U+201D (") - RIGHT DOUBLE QUOTATION MARK

Track descriptions follow the pattern: `Track N "TrackName"`

### Art Conductor Format
Art Conductor .plist files use a different structure than standard Logic articulation sets:
- `Switches` array instead of `Articulations`
- `MB1` field for MIDI byte 1 (note number)
- `Status` field for message type (e.g., "9" for Note On)

---

## File Structure

```
cubby-logic-remote/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Main web app
│   │   └── api/articulations/       # Articulation search API
│   ├── components/
│   │   └── ArticulationGrid.tsx     # Button grid component
│   └── lib/
│       ├── logicArticulationParser.ts  # .plist parser
│       └── midiHandler.ts           # MIDI/WebSocket handler
├── CubbyLogicMonitor/
│   ├── Sources/CubbyLogicMonitor/
│   │   └── main.swift               # Track detection app
│   └── CubbyLogicMonitor.app/       # Signed & notarized app bundle
├── midi-server.js                   # MIDI bridge server
├── SETUP_GUIDE.md                   # Installation instructions
└── USER_GUIDE.md                    # Usage instructions
```

---

## Tested Configurations

- **macOS:** Sequoia 15.x (Apple Silicon)
- **Logic Pro:** 11.x
- **Node.js:** 18+
- **Art Conductor:** Installed in default location
- **Browsers:** Chrome, Safari (desktop and iPad)

---

## Credits

Built by Willard Jansen with Claude Code assistance.

Inspired by:
- Cubby Remote (Cubase articulation controller)
- Babylonwaves Art Conductor & MetaGrid
- Apple's Accessibility APIs documentation

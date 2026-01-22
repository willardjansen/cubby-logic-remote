# Logic Pro Articulation Remote - Build Plan

## Goal

Build a Logic Pro version of Cubby Remote that auto-detects track selection and loads matching articulation maps, without depending on PlugSearch/MetaGrid/Babylonwaves.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Mac                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ LogicTrack  │───▶│ midi-server  │◀──▶│  Logic Pro    │  │
│  │ Monitor     │    │ (WebSocket)  │    │               │  │
│  │ (Swift App) │    │  :3001       │    │               │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│         │                  │                   ▲            │
│   Accessibility           │                   │            │
│   API                     │              IAC Driver        │
│                           ▼                   │            │
│                    ┌─────────────┐            │            │
│                    │  Next.js    │────────────┘            │
│                    │  Web App    │  (sends MIDI)           │
│                    │  :3000      │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
          ▲
          │ HTTP/WebSocket
          │
     ┌────┴────┐
     │  iPad   │
     └─────────┘
```

## Components to Build

### 1. LogicTrackMonitor (Swift macOS App)

A minimal menu bar app that monitors Logic Pro's selected track using macOS Accessibility APIs.

**Location:** `logic-track-monitor/` (new folder)

**Key Files:**
- `LogicTrackMonitor/main.swift` - App entry
- `LogicTrackMonitor/AccessibilityObserver.swift` - Track detection logic
- `LogicTrackMonitor/WebSocketClient.swift` - Send to midi-server

**Core APIs:**
```swift
import Cocoa
import ApplicationServices

// Get Logic Pro's accessibility element
let logicApp = NSWorkspace.shared.runningApplications.first {
    $0.bundleIdentifier == "com.apple.logic10"
}

// Create AXUIElement for the app
let appElement = AXUIElementCreateApplication(logicApp.processIdentifier)

// Observe for selection changes
AXObserverCreate(pid, callback, &observer)
AXObserverAddNotification(observer, element, kAXSelectedChildrenChangedNotification, nil)
```

**Output:** Sends JSON via WebSocket to midi-server:
```json
{ "type": "trackChange", "trackName": "Violin I" }
```

**Requirements:**
- macOS 10.15+
- Accessibility permission (System Preferences > Privacy > Accessibility)
- Runs as menu bar app (minimal UI)

### 2. Logic Articulation Parser

Logic uses different formats than Cubase for articulation data.

**Location:** `src/lib/logicArticulationParser.ts` (new file)

**Formats to support:**
- `.plist` - Logic's Articulation Set format
- Possibly `.xml` exports

**Research needed:**
- [ ] Find where Logic stores Articulation Sets
- [ ] Document the plist structure
- [ ] Map to existing Articulation interface

### 3. Adapt midi-server.js

Add handler for WebSocket messages from LogicTrackMonitor.

**Changes:**
```javascript
// In midi-server.js, add handler for track changes from Swift app
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'trackChange') {
      // Broadcast to all browser clients
      broadcastTrackName(msg.trackName);
    }
  });
});
```

### 4. Web App Changes

Minimal - the track switching logic already exists for Cubase. Just need to:
- Add Logic articulation format support
- Possibly different MIDI channel/note conventions

---

## Implementation Steps

### Phase 1: Research & Prototype

- [ ] **Explore Logic's Accessibility structure**
  - Use Accessibility Inspector (Xcode > Open Developer Tool > Accessibility Inspector)
  - Find the UI element that represents selected track
  - Document the element hierarchy

- [ ] **Find Logic Articulation Set format**
  - Check `~/Music/Audio Music Apps/Articulation Sets/`
  - Export an articulation set from Logic, examine structure
  - Document the plist/xml schema

- [ ] **Prototype Swift track detection**
  - Create minimal command-line Swift app
  - Successfully print track name when selection changes
  - Verify it works without PlugSearch

### Phase 2: Build LogicTrackMonitor App

- [ ] Create Xcode project (macOS App, Swift)
- [ ] Implement Accessibility observer
- [ ] Add WebSocket client (use Starscream or URLSessionWebSocketTask)
- [ ] Create menu bar UI with:
  - Status indicator (connected/disconnected)
  - Current track name display
  - Quit option
- [ ] Handle Accessibility permission request gracefully
- [ ] Test with Logic Pro

### Phase 3: Integrate with Cubby Remote

- [ ] Add Logic articulation parser to web app
- [ ] Update midi-server.js to accept Swift app connections
- [ ] Add Logic-specific MIDI output handling (if different from Cubase)
- [ ] Test end-to-end: Logic track change → Swift app → midi-server → web app

### Phase 4: Polish & Package

- [ ] Create installer/DMG for LogicTrackMonitor
- [ ] Write setup documentation
- [ ] Add Logic-specific UI elements to web app (optional)
- [ ] Test on iPad

---

## Technical Notes

### Accessibility API Gotchas

1. **Permission required** - App must be added to System Preferences > Security & Privacy > Privacy > Accessibility

2. **Logic must be running** - Observer only works when Logic is active

3. **UI element hierarchy** - Logic's track list is likely:
   ```
   AXApplication
   └── AXWindow (main window)
       └── AXSplitGroup or AXScrollArea
           └── AXTable or AXList (track list)
               └── AXRow (individual tracks)
                   └── AXStaticText (track name)
   ```

4. **Notification types to try:**
   - `kAXSelectedChildrenChangedNotification`
   - `kAXFocusedUIElementChangedNotification`
   - `kAXValueChangedNotification`

### Logic Articulation Sets

Location: `~/Music/Audio Music Apps/Articulation Sets/`

May also be embedded in:
- Channel strip settings
- Patches
- Project files

### Existing Cubase Code to Reuse

- `src/components/ArticulationGrid.tsx` - Display grid (reuse as-is)
- `src/components/ArticulationButton.tsx` - Button component (reuse as-is)
- `src/lib/midiHandler.ts` - WebSocket + MIDI sending (reuse as-is)
- `midi-server.js` - WebSocket server (extend)

---

## Resources

- [Apple Accessibility Programming Guide](https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/)
- [AXUIElement Reference](https://developer.apple.com/documentation/applicationservices/axuielement)
- [Starscream WebSocket Library](https://github.com/daltoniam/Starscream)
- Logic Pro Articulation documentation (in Logic Help menu)

---

## Questions to Answer

1. Does Logic send any MIDI when switching articulations that we could use instead of Accessibility?
2. Can we read the current articulation set from the selected track via Accessibility?
3. What's the exact plist structure for Logic Articulation Sets?
4. Do third-party articulation libraries (Spitfire, etc.) use standard Logic articulation sets?

---

## Notes

- PlugSearch uses this same Accessibility approach - so it's proven to work
- The Swift app is the main new work; everything else leverages existing Cubby Remote code
- Consider making the Swift app generic enough to detect other DAWs later (Pro Tools, Ableton)

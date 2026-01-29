# Cubby Logic Remote

Articulation controller for Logic Pro users, designed for iPad/tablet use. Switch articulations via MIDI while working in Logic Pro.

## Features

- **iPad Optimized** - Touch-friendly interface designed for tablets
- **Logic Pro Integration** - Works with Logic Pro's articulation system
- **Auto Port Detection** - Automatically finds available ports (avoids macOS AirPlay conflicts)
- **MIDI Bridge** - WebSocket-based MIDI bridge for iPad connectivity
- **System Tray App** - Runs in menu bar, always accessible

## Quick Start

### Download

Download the latest release:
- macOS Intel: `Cubby Logic Remote-x.x.x.dmg`
- macOS Apple Silicon: `Cubby Logic Remote-x.x.x-arm64.dmg`

### Setup

1. **Install the app** - Drag to Applications
2. **Launch** - The app runs in the menu bar
3. **Access on iPad** - Open `http://YOUR_MAC_IP:7100` in Safari

### macOS MIDI Setup

1. Open **Audio MIDI Setup** (Applications → Utilities)
2. Go to **Window → Show MIDI Studio**
3. Double-click **IAC Driver**
4. Check **"Device is online"**
5. Add a bus named "Browser to Cubase" (or similar)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Mac Host                            │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Next.js    │◀──▶│ MIDI Bridge  │◀──▶│ Logic Pro │  │
│  │  Web App    │    │  Server      │    │           │  │
│  │  :7100      │    │  :7101       │    │           │  │
│  └─────────────┘    └──────────────┘    └───────────┘  │
│         ▲                  ▲                   ▲        │
└─────────│──────────────────│───────────────────│────────┘
          │ HTTP             │ WebSocket         │ MIDI
          │                  │                   │
     ┌────┴──────────────────┴────┐         IAC Driver
     │         iPad               │
     │   Safari/Chrome Browser    │
     └────────────────────────────┘
```

## Troubleshooting

### Tablet shows ERR_SSL_PROTOCOL_ERROR

If you see SSL errors when connecting from a tablet:

1. Make sure you're using `http://` (not `https://`) in the URL
2. Try using an **incognito/private browsing** window
3. Clear the browser cache if you previously tried with HTTPS

The app uses HTTP by default, which works fine for local networks.

### iPad shows "MIDI Bridge not running"

Make sure the app is running (check menu bar icon).

### Ports are busy

The app automatically finds available ports starting from 7100. If you see port conflicts:
- Check for other Cubby apps running
- Quit any apps using ports 7100-7110

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run electron:dev

# Build for distribution
npm run electron:build:mac
```

## License

MIT License

## Author

**Willard Jansen** - [Cubby](https://cubby.audio)

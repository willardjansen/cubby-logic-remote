import Cocoa
import ApplicationServices

// MARK: - Logging

let logFile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("trackmonitor.log")

func log(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let line = "[\(timestamp)] \(message)\n"
    print(message)  // Also print to console

    if let data = line.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logFile.path) {
            if let handle = try? FileHandle(forWritingTo: logFile) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        } else {
            try? data.write(to: logFile)
        }
    }
}

// MARK: - WebSocket Client

class WebSocketClient: NSObject, URLSessionWebSocketDelegate {
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private let serverURL: URL
    private var isConnected = false
    private var reconnectTimer: Timer?

    var onConnected: (() -> Void)?
    var onDisconnected: (() -> Void)?

    init(url: URL) {
        self.serverURL = url
        super.init()
    }

    func connect() {
        let configuration = URLSessionConfiguration.default
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: OperationQueue.main)
        webSocket = session?.webSocketTask(with: serverURL)
        webSocket?.resume()

        // Start receiving messages
        receiveMessage()
    }

    func disconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        isConnected = false
    }

    func send(trackName: String) {
        guard isConnected else {
            log("⚠️ Not connected, cannot send track name")
            return
        }

        let message: [String: Any] = [
            "type": "trackChange",
            "trackName": trackName
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            webSocket?.send(.string(jsonString)) { error in
                if let error = error {
                    log("❌ Send error: \(error)")
                } else {
                    log("📤 Sent track: \"\(trackName)\"")
                }
            }
        }
    }

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    log("📥 Received: \(text)")
                case .data(let data):
                    log("📥 Received data: \(data.count) bytes")
                @unknown default:
                    break
                }
                // Continue receiving
                self?.receiveMessage()
            case .failure(let error):
                log("❌ Receive error: \(error)")
            }
        }
    }

    private func identify() {
        let message: [String: Any] = [
            "type": "identify",
            "clientType": "track-monitor"
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            webSocket?.send(.string(jsonString)) { error in
                if let error = error {
                    log("❌ Identify error: \(error)")
                }
            }
        }
    }

    private func scheduleReconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            log("🔄 Attempting reconnect...")
            self?.connect()
        }
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        log("✅ WebSocket connected")
        isConnected = true
        identify()
        onConnected?()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        log("❌ WebSocket closed")
        isConnected = false
        onDisconnected?()
        scheduleReconnect()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            log("❌ WebSocket error: \(error.localizedDescription)")
            isConnected = false
            onDisconnected?()
            scheduleReconnect()
        }
    }
}

// MARK: - Logic Track Monitor

class LogicTrackMonitor {
    private var observer: AXObserver?
    private var logicElement: AXUIElement?
    private var lastTrackName: String = ""
    private var pollTimer: Timer?

    // Regex to match "Track N "TrackName"" pattern (like MetaServer uses)
    // Pattern matches smart quotes (" ") used by Logic Pro
    private let trackPattern = try! NSRegularExpression(pattern: "Track \\d+ [\"\u{201C}](.+)[\"\u{201D}]", options: [])

    var onTrackChanged: ((String) -> Void)?

    func start() {
        log("🔍 Starting Logic Pro monitor...")

        // Start polling for Logic Pro and track changes
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
            self?.checkLogicPro()
        }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        removeObserver()
    }

    private var wasLogicActive = false
    private func checkLogicPro() {

        // Find Logic Pro in running applications
        guard let logicApp = NSWorkspace.shared.runningApplications.first(where: {
            $0.bundleIdentifier == "com.apple.logic10"
        }) else {
            if logicElement != nil {
                log("⚠️ Logic Pro not running")
                logicElement = nil
                removeObserver()
            }
            return
        }

        let pid = logicApp.processIdentifier
        let appElement = AXUIElementCreateApplication(pid)

        // If we haven't set up the observer yet, do it now
        if logicElement == nil {
            logicElement = appElement
            log("✅ Found Logic Pro (PID: \(pid))")
            setupObserver(for: pid)
        }

        // Check if Logic Pro just became active
        let isLogicActive = logicApp.isActive
        wasLogicActive = isLogicActive

        // Only check focus when Logic is the active app
        if isLogicActive {
            // Strategy 1: Look for focused element with "Track N "TrackName"" description
            if let trackName = getFocusedTrackName(from: appElement) {
                if trackName != lastTrackName {
                    lastTrackName = trackName
                    log("🎵 Track: \"\(trackName)\"")
                    onTrackChanged?(trackName)
                }
                return
            }

            // Try focused window approach
            var focusedWindowRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindowRef) == .success,
               let focusedWindow = focusedWindowRef {
                var focusedInWindowRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(focusedWindow as! AXUIElement, kAXFocusedUIElementAttribute as CFString, &focusedInWindowRef) == .success,
                   let focusedInWindow = focusedInWindowRef {
                    var descRef: CFTypeRef?
                    if AXUIElementCopyAttributeValue(focusedInWindow as! AXUIElement, kAXDescriptionAttribute as CFString, &descRef) == .success,
                       let desc = descRef as? String, !desc.isEmpty {
                        let focusInfo = "winFocus=\"\(desc)\""
                        if focusInfo != lastLoggedFocus {
                            lastLoggedFocus = focusInfo
                            log("🔍 WIN FOCUS: \(desc)")
                            if let trackName = parseTrackDescription(desc) {
                                if trackName != lastTrackName {
                                    lastTrackName = trackName
                                    log("🎵 Track: \"\(trackName)\"")
                                    onTrackChanged?(trackName)
                                }
                                return
                            }
                        }
                    }
                }
            }
        }

        // Strategy 2: Search windows for track description pattern (works even when not active)
        if let trackName = searchForTrackDescription(from: appElement) {
            if trackName != lastTrackName {
                lastTrackName = trackName
                log("🎵 Track: \"\(trackName)\"")
                onTrackChanged?(trackName)
            }
        }
    }

    // Get track name from focused element (matching MetaServer's approach)
    private var lastLoggedFocus: String = ""
    private func getFocusedTrackName(from appElement: AXUIElement) -> String? {
        var focusedRef: CFTypeRef?

        // Get the currently focused UI element
        let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedRef)


        guard result == .success, let focused = focusedRef else {
            return nil
        }

        // Debug: Log what we found
        var desc = ""
        var role = ""
        var descRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(focused as! AXUIElement, kAXDescriptionAttribute as CFString, &descRef) == .success,
           let d = descRef as? String {
            desc = d
        }
        var roleRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(focused as! AXUIElement, kAXRoleAttribute as CFString, &roleRef) == .success,
           let r = roleRef as? String {
            role = r
        }

        // Only log focus changes with non-empty description
        if !desc.isEmpty {
            let focusInfo = "desc=\"\(desc)\""
            if focusInfo != lastLoggedFocus {
                lastLoggedFocus = focusInfo
            }
        }

        // Check this element and its parents for the track pattern
        return extractTrackNameFromElement(focused as! AXUIElement, checkParents: true)
    }

    // Search through window hierarchy for track description
    private func searchForTrackDescription(from appElement: AXUIElement) -> String? {
        var windowsRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef) == .success,
              let windows = windowsRef as? [AXUIElement] else {
            return nil
        }

        for window in windows {
            if let trackName = searchElementTree(window, depth: 0, maxDepth: 12) {
                return trackName
            }
        }

        return nil
    }

    // Recursively search element tree for track description pattern
    private func searchElementTree(_ element: AXUIElement, depth: Int, maxDepth: Int) -> String? {
        if depth > maxDepth { return nil }

        // Check if this element has selected children (track list container)
        var selectedChildrenRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXSelectedChildrenAttribute as CFString, &selectedChildrenRef) == .success,
           let selectedChildren = selectedChildrenRef as? [AXUIElement], !selectedChildren.isEmpty {
            // Found selected children - check their descriptions
            for selected in selectedChildren {
                var descRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(selected, kAXDescriptionAttribute as CFString, &descRef) == .success,
                   let desc = descRef as? String {
                    if let trackName = parseTrackDescription(desc) {
                        return trackName
                    }
                }
            }
        }

        // Check description of this element
        var descRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descRef) == .success,
           let desc = descRef as? String, !desc.isEmpty {

            // Check if this is a track header container
            if desc == "Tracks header" {
                // This is the track list - check its selected children more carefully
                var childrenRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
                   let children = childrenRef as? [AXUIElement] {
                    for child in children {
                        // Check if this child track is selected
                        var selectedRef: CFTypeRef?
                        if AXUIElementCopyAttributeValue(child, kAXSelectedAttribute as CFString, &selectedRef) == .success,
                           let selected = selectedRef as? Bool, selected {
                            var childDescRef: CFTypeRef?
                            if AXUIElementCopyAttributeValue(child, kAXDescriptionAttribute as CFString, &childDescRef) == .success,
                               let childDesc = childDescRef as? String {
                                if let trackName = parseTrackDescription(childDesc) {
                                    return trackName
                                }
                            }
                        }
                    }

                    // If no selected attribute, check for SelectedRows
                    var selectedRowsRef: CFTypeRef?
                    if AXUIElementCopyAttributeValue(element, kAXSelectedRowsAttribute as CFString, &selectedRowsRef) == .success,
                       let selectedRows = selectedRowsRef as? [AXUIElement] {
                        for row in selectedRows {
                            var rowDescRef: CFTypeRef?
                            if AXUIElementCopyAttributeValue(row, kAXDescriptionAttribute as CFString, &rowDescRef) == .success,
                               let rowDesc = rowDescRef as? String {
                                if let trackName = parseTrackDescription(rowDesc) {
                                    log("🎯 Selected row: \"\(trackName)\"")
                                    return trackName
                                }
                            }
                        }
                    }

                }
            }
        }

        // Check children recursively
        var childrenRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
           let children = childrenRef as? [AXUIElement] {
            for child in children {
                if let trackName = searchElementTree(child, depth: depth + 1, maxDepth: maxDepth) {
                    return trackName
                }
            }
        }

        return nil
    }

    // Extract track name from element description matching "Track N "TrackName""
    private func extractTrackNameFromElement(_ element: AXUIElement, checkParents: Bool) -> String? {
        var currentElement: AXUIElement? = element
        var depth = 0

        while let elem = currentElement, depth < 5 {
            // Check AXDescription attribute (this is what MetaServer uses)
            var descRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(elem, kAXDescriptionAttribute as CFString, &descRef) == .success,
               let desc = descRef as? String {
                if let trackName = parseTrackDescription(desc) {
                    return trackName
                }
            }

            // Also check AXTitle and AXValue
            var titleRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(elem, kAXTitleAttribute as CFString, &titleRef) == .success,
               let title = titleRef as? String {
                if let trackName = parseTrackDescription(title) {
                    return trackName
                }
            }

            var valueRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(elem, kAXValueAttribute as CFString, &valueRef) == .success,
               let value = valueRef as? String {
                if let trackName = parseTrackDescription(value) {
                    return trackName
                }
            }

            if !checkParents { break }

            // Move to parent
            var parentRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(elem, kAXParentAttribute as CFString, &parentRef) == .success,
               let parent = parentRef {
                currentElement = (parent as! AXUIElement)
                depth += 1
            } else {
                break
            }
        }

        return nil
    }

    // Parse description matching "Track N "TrackName"" pattern
    private func parseTrackDescription(_ desc: String) -> String? {
        let range = NSRange(desc.startIndex..<desc.endIndex, in: desc)

        if let match = trackPattern.firstMatch(in: desc, options: [], range: range) {
            if let trackNameRange = Range(match.range(at: 1), in: desc) {
                let trackName = String(desc[trackNameRange])
                if !trackName.isEmpty && trackName.count >= 2 {
                    return trackName
                }
            }
        }


        return nil
    }

    private func setupObserver(for pid: pid_t) {
        var observer: AXObserver?

        // Store self pointer for callback
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()

        let callback: AXObserverCallback = { observer, element, notification, userData in
            guard let userData = userData else { return }
            let monitor = Unmanaged<LogicTrackMonitor>.fromOpaque(userData).takeUnretainedValue()

            // Get info about the element
            var descRef: CFTypeRef?
            var desc = ""
            if AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descRef) == .success,
               let d = descRef as? String {
                desc = d
            }

            var roleRef: CFTypeRef?
            var role = ""
            if AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef) == .success,
               let r = roleRef as? String {
                role = r
            }

            var valueRef: CFTypeRef?
            var value = ""
            if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef) == .success,
               let v = valueRef as? String {
                value = v
            }


            // Check if description matches our track pattern
            if !desc.isEmpty {
                if let trackName = monitor.parseTrackDescription(desc) {
                    if trackName != monitor.lastTrackName {
                        monitor.lastTrackName = trackName
                        log("🎵 Track: \"\(trackName)\"")
                        monitor.onTrackChanged?(trackName)
                    }
                    return
                }
            }

            // Also check value for track pattern
            if !value.isEmpty {
                if let trackName = monitor.parseTrackDescription(value) {
                    if trackName != monitor.lastTrackName {
                        monitor.lastTrackName = trackName
                        log("🎵 Track: \"\(trackName)\"")
                        monitor.onTrackChanged?(trackName)
                    }
                    return
                }
            }

            // Check parent if direct element doesn't have it
            var parentRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &parentRef) == .success,
               let parent = parentRef {
                var parentDescRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(parent as! AXUIElement, kAXDescriptionAttribute as CFString, &parentDescRef) == .success,
                   let parentDesc = parentDescRef as? String, !parentDesc.isEmpty {
                    if let trackName = monitor.parseTrackDescription(parentDesc) {
                        if trackName != monitor.lastTrackName {
                            monitor.lastTrackName = trackName
                            log("🎵 Track: \"\(trackName)\"")
                            monitor.onTrackChanged?(trackName)
                        }
                    }
                }
            }
        }

        let result = AXObserverCreate(pid, callback, &observer)
        if result == .success, let observer = observer {
            self.observer = observer

            // Add to run loop
            CFRunLoopAddSource(
                CFRunLoopGetCurrent(),
                AXObserverGetRunLoopSource(observer),
                .defaultMode
            )

            // Register for multiple notification types
            if let logicElement = logicElement {
                let notifications = [
                    kAXFocusedUIElementChangedNotification,
                    kAXSelectedChildrenChangedNotification,
                    kAXValueChangedNotification,
                    kAXTitleChangedNotification,
                    kAXSelectedRowsChangedNotification,
                    kAXSelectedTextChangedNotification
                ]

                for notif in notifications {
                    AXObserverAddNotification(observer, logicElement, notif as CFString, selfPtr)
                }
                log("📡 Registered for \(notifications.count) notification types")
            }

            log("✅ Accessibility observer registered")
        }
    }

    private func removeObserver() {
        if let observer = observer {
            CFRunLoopRemoveSource(
                CFRunLoopGetCurrent(),
                AXObserverGetRunLoopSource(observer),
                .defaultMode
            )
        }
        observer = nil
    }
}

// MARK: - Menu Bar App

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var trackMonitor: LogicTrackMonitor!
    private var webSocket: WebSocketClient!

    private var currentTrackMenuItem: NSMenuItem!
    private var connectionMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Check for Accessibility permission
        checkAccessibilityPermission()

        // Create status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "music.note", accessibilityDescription: "Logic Track Monitor")
        }

        // Create menu
        let menu = NSMenu()

        currentTrackMenuItem = NSMenuItem(title: "No track selected", action: nil, keyEquivalent: "")
        currentTrackMenuItem.isEnabled = false
        menu.addItem(currentTrackMenuItem)

        menu.addItem(NSMenuItem.separator())

        connectionMenuItem = NSMenuItem(title: "Connecting...", action: nil, keyEquivalent: "")
        connectionMenuItem.isEnabled = false
        menu.addItem(connectionMenuItem)

        menu.addItem(NSMenuItem.separator())

        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))

        statusItem.menu = menu

        // Initialize WebSocket
        let wsURL = URL(string: "ws://localhost:3001")!
        webSocket = WebSocketClient(url: wsURL)

        webSocket.onConnected = { [weak self] in
            DispatchQueue.main.async {
                self?.connectionMenuItem.title = "✅ Connected to MIDI Bridge"
            }
        }

        webSocket.onDisconnected = { [weak self] in
            DispatchQueue.main.async {
                self?.connectionMenuItem.title = "❌ Disconnected"
            }
        }

        webSocket.connect()

        // Initialize track monitor
        trackMonitor = LogicTrackMonitor()
        trackMonitor.onTrackChanged = { [weak self] trackName in
            DispatchQueue.main.async {
                self?.currentTrackMenuItem.title = "🎵 \(trackName)"
                self?.webSocket.send(trackName: trackName)
            }
        }
        trackMonitor.start()

        log("🎹 LogicTrackMonitor started")
    }

    func applicationWillTerminate(_ notification: Notification) {
        trackMonitor.stop()
        webSocket.disconnect()
    }

    private func checkAccessibilityPermission() {
        let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true]
        let trusted = AXIsProcessTrustedWithOptions(options)

        if !trusted {
            log("⚠️ Please grant Accessibility permission in System Preferences")
            log("   System Preferences → Security & Privacy → Privacy → Accessibility")
        } else {
            log("✅ Accessibility permission granted")
        }
    }

    @objc func quit() {
        NSApplication.shared.terminate(self)
    }
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate

// Run as agent (no dock icon)
app.setActivationPolicy(.accessory)

app.run()

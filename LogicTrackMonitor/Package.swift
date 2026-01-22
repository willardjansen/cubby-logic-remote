// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LogicTrackMonitor",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "LogicTrackMonitor",
            dependencies: [],
            path: "Sources/LogicTrackMonitor"
        )
    ]
)

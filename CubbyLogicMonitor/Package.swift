// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CubbyLogicMonitor",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "CubbyLogicMonitor",
            dependencies: [],
            path: "Sources/CubbyLogicMonitor"
        )
    ]
)

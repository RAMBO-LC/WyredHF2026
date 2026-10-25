// SharedBrain for macOS — a native window around the bundled Node.js server.
//
// On launch the app starts `node dist/server/index.js` from its Resources folder on a free
// localhost port, waits for /api/health, and shows the UI in a WKWebView. Data lives in
// ~/Library/Application Support/SharedBrain and logs in ~/Library/Logs/SharedBrain.

import Cocoa
import WebKit

final class ServerController {
    private(set) var port: Int = 0
    private var process: Process?
    private var logHandle: FileHandle?
    var onExit: ((Int32) -> Void)?

    let supportDir: URL
    let logURL: URL
    let envURL: URL

    init() {
        let fm = FileManager.default
        supportDir = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SharedBrain", isDirectory: true)
        let logsDir = fm.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/SharedBrain", isDirectory: true)
        logURL = logsDir.appendingPathComponent("server.log")
        envURL = supportDir.appendingPathComponent(".env")
        try? fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
        try? fm.createDirectory(at: logsDir, withIntermediateDirectories: true)
        try? fm.createDirectory(at: supportDir.appendingPathComponent("incoming"), withIntermediateDirectories: true)
        if !fm.fileExists(atPath: envURL.path) {
            let template = """
            # SharedBrain settings. Restart the server (File → Restart Server) after editing.
            # With no key set, answers are extractive quotes from your documents.

            # OpenAI or any OpenAI-compatible API (Ollama, LM Studio, OpenRouter, Groq…)
            # OPENAI_API_KEY=
            # OPENAI_BASE_URL=https://api.openai.com/v1
            # OPENAI_MODEL=gpt-4o-mini

            # Local model with Ollama:
            # OPENAI_API_KEY=ollama
            # OPENAI_BASE_URL=http://localhost:11434/v1
            # OPENAI_MODEL=llama3.1

            # Google Gemini (used only when no OpenAI key is set)
            # GEMINI_API_KEY=
            # GEMINI_MODEL=gemini-2.5-flash

            """
            try? template.write(to: envURL, atomically: true, encoding: .utf8)
        }
    }

    var isRunning: Bool { process?.isRunning ?? false }

    func start() throws {
        guard let resources = Bundle.main.resourceURL else { throw NSError(domain: "SharedBrain", code: 1) }
        let node = resources.appendingPathComponent("runtime/node")
        let appDir = resources.appendingPathComponent("app")
        let entry = appDir.appendingPathComponent("dist/server/index.js")

        port = ServerController.freePort()

        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        logHandle = try FileHandle(forWritingTo: logURL)

        let p = Process()
        p.executableURL = node
        p.arguments = [entry.path]
        p.currentDirectoryURL = supportDir // so dotenv picks up the .env in Application Support
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["NODE_ENV"] = "production"
        env["DATABASE_PATH"] = supportDir.appendingPathComponent("shared_brain.db").path
        env["DATA_INCOMING_DIR"] = supportDir.appendingPathComponent("incoming").path
        env["DATA_PROCESSED_DIR"] = supportDir.appendingPathComponent("processed").path
        env["PUBLIC_DIR"] = appDir.appendingPathComponent("public").path
        p.environment = env
        p.standardOutput = logHandle
        p.standardError = logHandle
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async { self?.onExit?(proc.terminationStatus) }
        }
        try p.run()
        process = p
    }

    func stop() {
        guard let p = process else { return }
        process = nil
        p.terminationHandler = nil
        if p.isRunning {
            p.terminate()
            let deadline = Date().addingTimeInterval(3)
            while p.isRunning && Date() < deadline { usleep(50_000) }
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
        }
        try? logHandle?.close()
        logHandle = nil
    }

    /// Polls /api/health until the server answers or the timeout passes.
    func waitUntilReady(timeout: TimeInterval = 40, completion: @escaping (Bool) -> Void) {
        let url = URL(string: "http://127.0.0.1:\(port)/api/health")!
        let deadline = Date().addingTimeInterval(timeout)
        func attempt() {
            guard isRunning else { completion(false); return }
            var req = URLRequest(url: url)
            req.timeoutInterval = 1
            URLSession.shared.dataTask(with: req) { _, response, _ in
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    DispatchQueue.main.async { completion(true) }
                } else if Date() > deadline {
                    DispatchQueue.main.async { completion(false) }
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: attempt)
                }
            }.resume()
        }
        attempt()
    }

    static func freePort() -> Int {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return 3000 }
        defer { close(fd) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        addr.sin_port = 0
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        let bound = withUnsafeMutablePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, len) == 0 && getsockname(fd, $0, &len) == 0 }
        }
        return bound ? Int(UInt16(bigEndian: addr.sin_port)) : 3000
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let server = ServerController()
    var window: NSWindow!
    var webView: WKWebView!
    var statusView: NSStackView!
    var statusLabel: NSTextField!
    var spinner: NSProgressIndicator!
    var retryButton: NSButton!
    var quitting = false
    var titleObservation: NSKeyValueObservation?

    var baseURL: URL { URL(string: "http://127.0.0.1:\(server.port)")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        startServer()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        server.stop()
    }

    // MARK: Window

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "SharedBrain"
        window.minSize = NSSize(width: 900, height: 600)
        window.setFrameAutosaveName("SharedBrainMain")
        if window.frame.origin == .zero { window.center() }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isHidden = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
            let title = (view.title ?? "").replacingOccurrences(of: " · SharedBrain", with: "")
            self?.window.title = title.isEmpty || title.hasPrefix("SharedBrain") ? "SharedBrain" : "\(title) — SharedBrain"
        }

        spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.startAnimation(nil)

        statusLabel = NSTextField(labelWithString: "Starting SharedBrain…")
        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.alignment = .center
        statusLabel.maximumNumberOfLines = 4
        statusLabel.preferredMaxLayoutWidth = 420

        retryButton = NSButton(title: "Show Log", target: self, action: #selector(openLog))
        retryButton.isHidden = true

        statusView = NSStackView(views: [spinner, statusLabel, retryButton])
        statusView.orientation = .vertical
        statusView.spacing = 14
        statusView.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(webView)
        content.addSubview(statusView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            statusView.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            statusView.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
        window.contentView = content
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showStatus(_ text: String, busy: Bool, showLog: Bool = false) {
        statusLabel.stringValue = text
        spinner.isHidden = !busy
        if busy { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
        retryButton.isHidden = !showLog
        statusView.isHidden = false
        webView.isHidden = true
    }

    // MARK: Server lifecycle

    func startServer() {
        showStatus("Starting SharedBrain…", busy: true)
        server.onExit = { [weak self] status in
            guard let self = self, !self.quitting else { return }
            self.showStatus("The SharedBrain server stopped unexpectedly (exit code \(status)).\nUse File → Restart Server to try again.", busy: false, showLog: true)
        }
        do {
            try server.start()
        } catch {
            showStatus("Couldn't start the server: \(error.localizedDescription)", busy: false, showLog: true)
            return
        }
        server.waitUntilReady { [weak self] ready in
            guard let self = self else { return }
            if ready {
                self.statusView.isHidden = true
                self.webView.isHidden = false
                self.webView.load(URLRequest(url: self.baseURL.appendingPathComponent("app")))
            } else if self.server.isRunning {
                self.showStatus("The server is taking longer than expected to start.", busy: false, showLog: true)
            }
        }
    }

    @objc func restartServer() {
        server.onExit = nil
        server.stop()
        startServer()
    }

    // MARK: Menu actions

    @objc func openInBrowser() {
        let url = webView.url?.host == "127.0.0.1" ? webView.url! : baseURL
        NSWorkspace.shared.open(url)
    }
    @objc func openDropFolder() { NSWorkspace.shared.open(server.supportDir.appendingPathComponent("incoming")) }
    @objc func openDataFolder() { NSWorkspace.shared.open(server.supportDir) }
    @objc func openSettings() { NSWorkspace.shared.open(server.envURL) }
    @objc func openLog() { NSWorkspace.shared.open(server.logURL) }
    @objc func reload() { webView.reload() }
    @objc func goBack() { webView.goBack() }
    @objc func goForward() { webView.goForward() }
    @objc func goTo(_ sender: NSMenuItem) {
        guard server.isRunning, let path = sender.representedObject as? String else { return }
        webView.load(URLRequest(url: URL(string: path, relativeTo: baseURL)!))
    }
    @objc func zoomIn() { webView.pageZoom = min(webView.pageZoom + 0.1, 2.0) }
    @objc func zoomOut() { webView.pageZoom = max(webView.pageZoom - 0.1, 0.6) }
    @objc func zoomReset() { webView.pageZoom = 1.0 }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About SharedBrain", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide SharedBrain", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit SharedBrain", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        let browser = fileMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "o")
        browser.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Open Drop Folder", action: #selector(openDropFolder), keyEquivalent: "")
        fileMenu.addItem(withTitle: "Open Data Folder", action: #selector(openDataFolder), keyEquivalent: "")
        fileMenu.addItem(withTitle: "Edit Settings (.env)…", action: #selector(openSettings), keyEquivalent: ",")
        fileMenu.addItem(withTitle: "Show Server Log", action: #selector(openLog), keyEquivalent: "")
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Restart Server", action: #selector(restartServer), keyEquivalent: "")
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = fileMenu
        main.addItem(fileItem)

        // Needed so ⌘C / ⌘V / ⌘A work inside the web view.
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        main.addItem(editItem)

        let goItem = NSMenuItem()
        let goMenu = NSMenu(title: "Go")
        for (index, (title, path)) in [("Home", "/"), ("Ask", "/app"), ("Knowledge", "/knowledge"), ("Graph", "/graph"), ("Console", "/console"), ("Docs", "/docs")].enumerated() {
            let item = goMenu.addItem(withTitle: title, action: #selector(goTo(_:)), keyEquivalent: index == 0 ? "" : String(index))
            item.representedObject = path
        }
        goMenu.addItem(.separator())
        goMenu.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[")
        goMenu.addItem(withTitle: "Forward", action: #selector(goForward), keyEquivalent: "]")
        goItem.submenu = goMenu
        main.addItem(goItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "+")
        viewMenu.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-")
        viewMenu.addItem(withTitle: "Actual Size", action: #selector(zoomReset), keyEquivalent: "0")
        viewMenu.addItem(.separator())
        let fs = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    // MARK: WKNavigationDelegate

    func isLocal(_ url: URL?) -> Bool {
        guard let url = url else { return false }
        return url.host == "127.0.0.1" || url.host == "localhost" || url.scheme == "blob" || url.scheme == "about" || url.scheme == "data"
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        if let url = navigationAction.request.url, !isLocal(url), navigationAction.targetFrame?.isMainFrame ?? true {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if !navigationResponse.canShowMIMEType || disposition.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    // MARK: WKDownloadDelegate

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.url : nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {}

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let alert = NSAlert(error: error)
        alert.beginSheetModal(for: window)
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isLocal(url) { webView.load(navigationAction.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

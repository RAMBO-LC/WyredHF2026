// Renders the SharedBrain app icon (same mark as public/assets/logo.svg) to a 1024×1024 PNG.
// Usage: swift macos/make-icon.swift <output.png>

import AppKit

let size: CGFloat = 1024
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon_1024.png"

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

// macOS icon grid: 824pt rounded square centred in a 1024 canvas.
let inset: CGFloat = 100
let tile = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let radius: CGFloat = 185

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: NSColor(white: 0, alpha: 0.28).cgColor)
let path = CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius, transform: nil)
ctx.addPath(path)
ctx.setFillColor(NSColor(srgbRed: 0.05, green: 0.48, blue: 0.435, alpha: 1).cgColor)
ctx.fillPath()
ctx.restoreGState()

// Subtle top-to-bottom shading.
ctx.saveGState()
ctx.addPath(path)
ctx.clip()
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                          colors: [NSColor(white: 1, alpha: 0.10).cgColor, NSColor(white: 0, alpha: 0.10).cgColor] as CFArray,
                          locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: tile.maxY), end: CGPoint(x: 0, y: tile.minY), options: [])
ctx.restoreGState()

// Map the 32×32 SVG coordinates into the tile (SVG y grows downward).
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    let s = tile.width / 32
    return CGPoint(x: tile.minX + x * s, y: tile.maxY - y * s)
}
let s = tile.width / 32

ctx.setStrokeColor(NSColor(white: 1, alpha: 0.55).cgColor)
ctx.setLineWidth(1.6 * s)
ctx.setLineCap(.round)
for (a, b) in [((10, 11.5), (21.5, 9.5)), ((10, 11.5), (16, 22)), ((21.5, 9.5), (16, 22)), ((16, 22), (23.5, 21))] as [((CGFloat, CGFloat), (CGFloat, CGFloat))] {
    ctx.move(to: p(a.0, a.1))
    ctx.addLine(to: p(b.0, b.1))
}
ctx.strokePath()

ctx.setFillColor(NSColor.white.cgColor)
for (x, y, r) in [(10, 11.5, 3.0), (21.5, 9.5, 2.4), (16, 22, 3.2), (23.5, 21, 1.9)] as [(CGFloat, CGFloat, CGFloat)] {
    let c = p(x, y)
    ctx.fillEllipse(in: CGRect(x: c.x - r * s, y: c.y - r * s, width: r * 2 * s, height: r * 2 * s))
}

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print("wrote \(output)")

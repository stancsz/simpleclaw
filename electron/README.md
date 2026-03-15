# SimpleClaw Desktop Wrapper

This is the Electron-based desktop wrapper for SimpleClaw, providing a native desktop application experience.

## Architecture

The Electron wrapper integrates:
1. **Next.js Dashboard** (`server/`) - Web-based management interface
2. **Core Agent Engine** (`src/`) - Autonomous agent runtime
3. **Electron Shell** - Native desktop container

## Development

```bash
# Install dependencies
npm install

# Start in development mode (requires Next.js dev server running)
npm run electron:dev

# Build the server first
npm run build:server

# Package for distribution
npm run electron:build

# Platform-specific packaging
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

## Production Build

1. Ensure the Next.js server is built: `npm run build:server`
2. Run the appropriate packaging command for your target platform
3. Installers will be output to the `dist/` directory

## Security Notes

- **Context Isolation**: Enabled to prevent direct Node.js access from renderer
- **Sandbox**: Enabled for renderer processes
- **Preload Script**: Only exposes minimal, validated APIs to renderer
- **External Links**: Open in default browser, not Electron window
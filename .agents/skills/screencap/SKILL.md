---
name: screencap
description: Screen capture and display management for visual context. Use when the user needs to capture screenshots, list displays, or get visual context from the desktop. Triggers include requests to "take a screenshot", "capture my screen", "list displays", "get visual context", "screen capture", or any task requiring desktop visual information.
allowed-tools: Bash(screencap:*), Bash(node src/plugins/screencap.ts:*)
---

# Screen Capture Skill

## Overview

The screencap skill provides desktop visual context capture capabilities for the agent. It allows capturing screenshots of individual displays or all displays simultaneously, listing available displays, and managing screen capture operations.

## Core Commands

### Capture a Screenshot

```bash
# Capture primary display
screencap capture

# Capture specific display (0-indexed)
screencap capture display=1

# Capture with custom filename and format
screencap capture filename="my-screenshot.png" format="png"
screencap capture filename="screenshot.jpg" format="jpeg"

# Alternative action names
screencap screenshot
screencap screenshot display=0 format="jpg"
```

### List Available Displays

```bash
# List all displays with their IDs and properties
screencap list_displays
screencap displays
```

### Capture All Displays

```bash
# Capture all connected displays simultaneously
screencap capture_all
screencap all_screens

# Capture all displays with custom base filename
screencap capture_all filename="workspace-screenshot"
```

## Node.js Plugin Usage

The skill can also be invoked through the Node.js plugin directly:

```bash
# Using the plugin directly
node src/plugins/screencap.ts action=capture
node src/plugins/screencap.ts action=list_displays
node src/plugins/screencap.ts action=capture_all filename="all-displays"
```

## Output Files

Screenshots are saved to the `screenshots/` directory in the project root with timestamped filenames:
- `screenshots/screenshot-2025-03-15T15-30-45-123Z.png`
- `screenshots/screenshot-all-display0-2025-03-15T15-30-45-123Z.png`
- `screenshots/screenshot-all-display1-2025-03-15T15-30-45-123Z.png`

## Use Cases

### Visual Context for Agent
```bash
# Agent needs to see what's on screen
screencap capture
# Returns: {"success": true, "filepath": "screenshots/screenshot-...", ...}
```

### Multi-Monitor Setup
```bash
# List all displays to understand workspace
screencap list_displays
# Capture all monitors for full context
screencap capture_all
```

### Documentation and Debugging
```bash
# Capture current state for documentation
screencap capture filename="bug-report.png"
# Capture specific display for focused debugging
screencap capture display=1 filename="secondary-monitor.jpg"
```

## Platform Support

- **Windows**: Full support via `screenshot-desktop` library
- **macOS**: Full support via `screenshot-desktop` library  
- **Linux**: Requires `scrot` or similar screenshot utility installed

## Error Handling

The skill provides detailed error messages for common issues:
- Display index out of bounds
- Permission denied for screen capture
- Missing dependencies on Linux
- File system errors
#!/bin/bash
# SimpleClaw Unified Installer
# One-click setup for new workstation users
# Works on macOS, Linux, and Windows (via Git Bash/WSL)

set -e

echo "🦀 SimpleClaw - Autonomous Agent Workstation"
echo "============================================"
echo ""

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)    echo "macOS" ;;
        Linux*)     echo "Linux" ;;
        CYGWIN*|MINGW*|MSYS*) echo "Windows" ;;
        *)          echo "Unknown" ;;
    esac
}

PLATFORM=$(detect_platform)
echo "📋 Platform detected: $PLATFORM"

# Check if we're already in a SimpleClaw directory
is_simpleclaw_dir() {
    [ -f "package.json" ] && grep -q "simpleclaw" package.json 2>/dev/null || [ -f "CLAUDE.md" ]
}

# Install Bun if not present
install_bun() {
    if ! command -v bun &> /dev/null; then
        echo "📦 Installing Bun runtime..."
        case "$PLATFORM" in
            macOS|Linux)
                curl -fsSL https://bun.sh/install | bash
                # Update shell config
                if [ -f "$HOME/.bashrc" ]; then
                    source "$HOME/.bashrc" 2>/dev/null || true
                fi
                if [ -f "$HOME/.zshrc" ]; then
                    source "$HOME/.zshrc" 2>/dev/null || true
                fi
                ;;
            Windows)
                echo "⚠️  Windows users: Attempting to install Bun via PowerShell..."
                if command -v powershell &> /dev/null; then
                    echo "📦 Installing Bun via PowerShell..."
                    powershell -c "irm bun.sh/install.ps1 | iex"
                    
                    # Check multiple possible Bun locations on Windows
                    echo "🔍 Looking for Bun in common Windows locations..."
                    
                    # Try different path formats for Windows
                    BUN_PATHS=(
                        "$HOME/.bun/bin"
                        "$USERPROFILE/.bun/bin"
                        "/c/Users/$USERNAME/.bun/bin"
                        "$(cygpath -u "$USERPROFILE")/.bun/bin"
                    )
                    
                    BUN_FOUND=false
                    for BUN_PATH in "${BUN_PATHS[@]}"; do
                        if [ -d "$BUN_PATH" ] && [ -f "$BUN_PATH/bun" ] || [ -f "$BUN_PATH/bun.exe" ]; then
                            echo "✅ Found Bun at: $BUN_PATH"
                            export PATH="$BUN_PATH:$PATH"
                            BUN_FOUND=true
                            break
                        fi
                    done
                    
                    # Also check if bun is already in PATH from system installation
                    if command -v bun &> /dev/null; then
                        echo "✅ Bun found in PATH: $(bun --version)"
                        BUN_FOUND=true
                    fi
                    
                    if [ "$BUN_FOUND" = false ]; then
                        echo "❌ Bun installation completed but not found in expected locations"
                        echo ""
                        echo "   The Bun installer may have added it to your system PATH, but"
                        echo "   you need to restart your terminal for the changes to take effect."
                        echo ""
                        echo "   After restarting, run this script again."
                        echo ""
                        echo "   If Bun is still not found, install it manually:"
                        echo "   1. Open PowerShell as Administrator"
                        echo "   2. Run: irm bun.sh/install.ps1 | iex"
                        echo "   3. Restart your terminal"
                        echo "   4. Run this script again"
                        exit 1
                    else
                        echo "✅ Bun installed successfully: $(bun --version)"
                        # Try to add Bun to current session PATH
                        BUN_PATH="$HOME/.bun/bin"
                        if [ -d "$BUN_PATH" ] && [[ ":$PATH:" != *":$BUN_PATH:"* ]]; then
                            export PATH="$BUN_PATH:$PATH"
                            echo "📝 Added Bun to current session PATH"
                        fi
                    fi
                else
                    echo "❌ PowerShell not available"
                    echo "   Please install Bun manually from https://bun.sh"
                    echo "   Then restart your terminal and run this script again."
                    exit 1
                fi
                ;;
            *)
                echo "❌ Unsupported platform for automatic Bun installation"
                exit 1
                ;;
        esac
    else
        echo "✅ Bun already installed: $(bun --version)"
    fi
    
    # Final verification
    if ! command -v bun &> /dev/null; then
        echo "❌ Bun not found in PATH after installation attempt"
        echo "   Please ensure Bun is installed and in your PATH"
        echo "   Windows: Check if %USERPROFILE%\.bun\bin is in PATH"
        echo "   macOS/Linux: Check if ~/.bun/bin is in PATH"
        echo "   Then restart your terminal and run this script again."
        exit 1
    fi
}

# Clone or update repository
setup_repo() {
    if is_simpleclaw_dir; then
        echo "📁 Already in SimpleClaw directory"
        echo "🔄 Updating from git..."
        git pull origin main 2>/dev/null || echo "⚠️  Could not update (not a git repo or no network)"
    else
        echo "📥 Cloning SimpleClaw repository..."
        git clone https://github.com/stancsz/simpleclaw.git simpleclaw-setup
        cd simpleclaw-setup
    fi
}

# Install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    
    # Windows-specific: Use cmd.exe for bun commands if in Git Bash
    if [ "$PLATFORM" = "Windows" ] && command -v cmd.exe &> /dev/null; then
        echo "🪟 Using Windows-compatible package installation..."
        cmd.exe /c "bun install" 2>/dev/null || bun install
    else
        bun install
    fi
    
    # Check for agent-browser dependency
    if ! bun list | grep -q "agent-browser"; then
        echo "🌐 Installing agent-browser..."
        if [ "$PLATFORM" = "Windows" ] && command -v cmd.exe &> /dev/null; then
            cmd.exe /c "bun add agent-browser" 2>/dev/null || bun add agent-browser
        else
            bun add agent-browser
        fi
    fi
}

# Setup environment
setup_env() {
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        echo "📝 Creating .env file from example..."
        cp .env.example .env
        echo ""
        echo "⚠️  IMPORTANT: Edit .env file and add your API keys:"
        echo "   - OPENAI_API_KEY or DEEPSEEK_API_KEY for LLM access"
        echo "   - Other API keys as needed for skills"
        echo ""
        echo "You can edit it now with: nano .env (or your preferred editor)"
    elif [ -f ".env" ]; then
        echo "✅ .env file already exists"
    else
        echo "⚠️  No .env.example found, creating minimal .env..."
        echo "# SimpleClaw Environment Variables" > .env
        echo "# Add your API keys here" >> .env
        echo "# OPENAI_API_KEY=your_key_here" >> .env
        echo "# DEEPSEEK_API_KEY=your_key_here" >> .env
    fi
}

# Setup browser automation
setup_browser() {
    echo "🌐 Setting up browser automation..."
    
    # Windows-specific Playwright installation
    if [ "$PLATFORM" = "Windows" ]; then
        echo "🪟 Windows detected - installing Playwright for Windows..."
        if command -v bun &> /dev/null; then
            bunx playwright install chromium 2>/dev/null || echo "⚠️  Playwright installation skipped (optional)"
        elif command -v npx &> /dev/null; then
            npx playwright install chromium 2>/dev/null || echo "⚠️  Playwright installation skipped (optional)"
        else
            echo "⚠️  Neither bun nor npx available, skipping Playwright"
            echo "   Browser skill may need manual setup: https://playwright.dev/docs/intro"
        fi
    else
        if command -v npx &> /dev/null; then
            npx playwright install chromium 2>/dev/null || echo "⚠️  Playwright installation skipped (optional)"
        else
            echo "⚠️  npx not available, skipping Playwright (browser skill may need manual setup)"
        fi
    fi
}

# Final instructions
show_instructions() {
    echo ""
    echo "🎉 SimpleClaw setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your API keys"
    echo "2. Start SimpleClaw with:"
    echo "   bun run start"
    echo ""
    echo "Or try the self-improvement loop:"
    echo "   ./loop/dogfood.sh"
    echo ""
    echo "Available commands:"
    echo "  bun run start      - Start the agent"
    echo "  bun run test       - Run tests"
    echo "  ./loop/dogfood.sh  - Self-improvement mode"
    echo ""
    echo "📚 Documentation:"
    echo "  - Read SPEC.md for architecture overview"
    echo "  - Read CLAUDE.md for current status"
    echo "  - Check .agents/skills/ for available skills"
}

# Main execution
main() {
    echo "🚀 Starting SimpleClaw installation..."
    echo ""
    
    install_bun
    setup_repo
    install_deps
    setup_env
    setup_browser
    show_instructions
}

# Run main function
main
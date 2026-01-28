#!/bin/bash
set -e

# Download platform-specific FFmpeg and whisper-cli binaries for CI builds
# Usage: TARGET_OS=macOS|Windows|Linux bash scripts/download-binaries.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# FFmpeg versions
FFMPEG_VERSION="7.1"

# Whisper.cpp release
WHISPER_VERSION="v1.7.4"

download_macos() {
    echo "Downloading macOS binaries..."
    
    BIN_DIR="$ROOT_DIR/rust/bin"
    mkdir -p "$BIN_DIR/lib"
    
    # Check if already exists
    if [[ -f "$BIN_DIR/ffmpeg" && -f "$BIN_DIR/whisper-cli-macos-arm64" ]]; then
        echo "macOS binaries already exist, skipping download"
        return
    fi
    
    # Download FFmpeg from evermeet.cx (static builds for macOS)
    echo "Downloading FFmpeg..."
    curl -L "https://evermeet.cx/ffmpeg/ffmpeg-${FFMPEG_VERSION}.zip" -o /tmp/ffmpeg.zip
    unzip -o /tmp/ffmpeg.zip -d "$BIN_DIR"
    chmod +x "$BIN_DIR/ffmpeg"
    
    curl -L "https://evermeet.cx/ffmpeg/ffprobe-${FFMPEG_VERSION}.zip" -o /tmp/ffprobe.zip
    unzip -o /tmp/ffprobe.zip -d "$BIN_DIR"
    chmod +x "$BIN_DIR/ffprobe"
    
    # Download whisper.cpp
    echo "Downloading whisper-cli..."
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
        WHISPER_ASSET="whisper-cli-macos-arm64"
    else
        WHISPER_ASSET="whisper-cli-macos-x64"
    fi
    
    curl -L "https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_VERSION}/${WHISPER_ASSET}" \
        -o "$BIN_DIR/whisper-cli-macos-arm64"
    chmod +x "$BIN_DIR/whisper-cli-macos-arm64"
    
    echo "macOS binaries downloaded successfully"
}

download_windows() {
    echo "Downloading Windows binaries..."
    
    BIN_DIR="$ROOT_DIR/rust/bin-win"
    mkdir -p "$BIN_DIR/lib"
    
    # Check if already exists
    if [[ -f "$BIN_DIR/ffmpeg.exe" && -f "$BIN_DIR/whisper-cli.exe" ]]; then
        echo "Windows binaries already exist, skipping download"
        return
    fi
    
    # Download FFmpeg from gyan.dev (Windows builds with all codecs)
    echo "Downloading FFmpeg..."
    FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    curl -L "$FFMPEG_URL" -o /tmp/ffmpeg-win.zip
    unzip -o /tmp/ffmpeg-win.zip -d /tmp/ffmpeg-win
    
    # Find and copy binaries
    find /tmp/ffmpeg-win -name "ffmpeg.exe" -exec cp {} "$BIN_DIR/" \;
    find /tmp/ffmpeg-win -name "ffprobe.exe" -exec cp {} "$BIN_DIR/" \;
    
    # Download whisper.cpp Windows build
    echo "Downloading whisper-cli..."
    curl -L "https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-cli-win64.exe" \
        -o "$BIN_DIR/whisper-cli.exe"
    
    echo "Windows binaries downloaded successfully"
}

download_linux() {
    echo "Downloading Linux binaries..."
    
    BIN_DIR="$ROOT_DIR/rust/bin-linux"
    mkdir -p "$BIN_DIR/lib"
    
    # Check if already exists
    if [[ -f "$BIN_DIR/ffmpeg" && -f "$BIN_DIR/whisper-cli" ]]; then
        echo "Linux binaries already exist, skipping download"
        return
    fi
    
    # Download FFmpeg static build for Linux
    echo "Downloading FFmpeg..."
    FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
    curl -L "$FFMPEG_URL" -o /tmp/ffmpeg-linux.tar.xz
    tar -xf /tmp/ffmpeg-linux.tar.xz -C /tmp
    
    # Find and copy binaries
    find /tmp -name "ffmpeg" -type f -executable -exec cp {} "$BIN_DIR/" \;
    find /tmp -name "ffprobe" -type f -executable -exec cp {} "$BIN_DIR/" \;
    chmod +x "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe"
    
    # Download whisper.cpp Linux build
    echo "Downloading whisper-cli..."
    curl -L "https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-cli-linux-x64" \
        -o "$BIN_DIR/whisper-cli"
    chmod +x "$BIN_DIR/whisper-cli"
    
    echo "Linux binaries downloaded successfully"
}

# Detect OS if not specified
if [[ -z "$TARGET_OS" ]]; then
    case "$(uname -s)" in
        Darwin) TARGET_OS="macOS" ;;
        Linux) TARGET_OS="Linux" ;;
        MINGW*|MSYS*|CYGWIN*) TARGET_OS="Windows" ;;
        *) echo "Unknown OS"; exit 1 ;;
    esac
fi

echo "Target OS: $TARGET_OS"

case "$TARGET_OS" in
    macOS|Darwin)
        download_macos
        ;;
    Windows)
        download_windows
        ;;
    Linux)
        download_linux
        ;;
    *)
        echo "Unknown TARGET_OS: $TARGET_OS"
        exit 1
        ;;
esac

echo "Done!"

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';

const execPromise = promisify(exec);

export interface ScreenshotOptions {
  // Options reserved for future use
}

export interface ScreenshotResult {
  base64Data: string;
  mimeType: string;
}

export interface FileSystem {
  readFile: typeof readFile;
  unlink: typeof unlink;
}

/**
 * Screenshot captures images of the active iTerm2 terminal.
 * 
 * Uses macOS's built-in `screencapture` CLI tool via AppleScript to capture
 * the terminal window or screen region. Returns the image as base64-encoded PNG.
 */
class Screenshot {
  private _execPromise: typeof execPromise;
  private _fs: FileSystem;

  constructor(execPromiseOverride?: typeof execPromise, fsOverride?: FileSystem) {
    this._execPromise = execPromiseOverride || execPromise;
    this._fs = fsOverride || { readFile, unlink };
  }

  /**
   * Captures a screenshot of the active iTerm2 terminal window.
   * 
   * Uses AppleScript to get the window bounds, then uses macOS `screencapture`
   * to capture that region and return it as base64-encoded PNG.
   * 
   * @param options Configuration options for the screenshot
   * @returns Base64-encoded PNG image data
   */
  async capture(_options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const tempPath = `/tmp/iterm_mcp_screenshot_${Date.now()}.png`;

    try {
      await this.captureTerminalRegion(tempPath);

      // Read the file and convert to base64
      const imageBuffer = await this._fs.readFile(tempPath);
      const base64Data = imageBuffer.toString('base64');

      // Clean up temp file
      await this._fs.unlink(tempPath).catch(() => {
        // Ignore cleanup errors
      });

      return {
        base64Data,
        mimeType: 'image/png'
      };
    } catch (error: unknown) {
      // Clean up temp file on error too
      await this._fs.unlink(tempPath).catch(() => {
        // Ignore cleanup errors
      });
      throw new Error(`Failed to capture screenshot: ${(error as Error).message}`);
    }
  }

  /**
   * Captures the current iTerm2 window by its window id.
   *
   * Uses `screencapture -l<windowId>` which captures the window's pixels from
   * the WindowServer. This correctly captures iTerm even when other windows
   * are on top of it, and does not require iTerm to be focused.
   *
   * iTerm2's AppleScript `id of current window` returns the CGWindowID, which
   * is exactly what `screencapture -l` expects.
   */
  private async captureTerminalRegion(tempPath: string): Promise<void> {
    const { stdout } = await this._execPromise(
      `osascript -e 'tell application "iTerm2" to id of current window'`
    );
    const windowId = stdout.trim();
    if (!/^\d+$/.test(windowId)) {
      throw new Error(`Unexpected iTerm2 window id: "${windowId}"`);
    }
    // -l: window id, -x: no sound, -o: exclude shadow (cleaner image)
    await this._execPromise(`screencapture -l${windowId} -x -o "${tempPath}"`);
  }
}

export default Screenshot;

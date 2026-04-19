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
   * Captures only the terminal content area (excluding window decorations).
   */
  private async captureTerminalRegion(tempPath: string): Promise<void> {
    // Use multiple -e flags for proper multi-line AppleScript
    const appleScriptLines = [
      'tell application "iTerm2"',
      '  tell current window',
      '    set winBounds to bounds',
      '    set {x1, y1, x2, y2} to winBounds',
      '    -- Calculate terminal region (account for window decorations)',
      '    -- iTerm typically has ~40pt title bar and ~2px borders',
      '    set titleBarHeight to 40',
      '    set borderWidth to 2',
      '    set termX to x1 + borderWidth',
      '    set termY to y1 + titleBarHeight',
      '    set termWidth to (x2 - x1) - (borderWidth * 2)',
      '    set termHeight to (y2 - y1) - titleBarHeight - borderWidth',
      '    return termX & "," & termY & "," & termWidth & "," & termHeight',
      '  end tell',
      'end tell'
    ];

    const scriptArg = appleScriptLines.map(line => `-e '${line.replace(/'/g, "'\\''")}'`).join(' ');
    const { stdout } = await this._execPromise(`osascript ${scriptArg}`);

    const bounds = this.parseBounds(stdout.trim());
    await this._execPromise(`screencapture -R${bounds} -x "${tempPath}"`);
  }

  /**
   * Parse bounds string from AppleScript into screencapture format.
   * AppleScript returns "x, y, width, height" but screencapture needs "x,y,width,height".
   */
  private parseBounds(boundsStr: string): string {
    // Extract numbers from the string, handling various formats
    const numbers = boundsStr.match(/-?\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 4) {
      throw new Error(`Invalid bounds output from AppleScript: ${boundsStr}`);
    }
    return numbers.slice(0, 4).join(',');
  }
}

export default Screenshot;

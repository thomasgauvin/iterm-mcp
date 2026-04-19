// @ts-nocheck
import { jest, describe, expect, test, beforeEach } from '@jest/globals';
import Screenshot from '../../src/Screenshot.js';

describe('Screenshot', () => {
  let screenshot: Screenshot;
  let mockExecPromise: jest.Mock;
  let mockReadFile: jest.Mock;
  let mockUnlink: jest.Mock;

  beforeEach(() => {
    mockExecPromise = jest.fn();
    mockReadFile = jest.fn();
    mockUnlink = jest.fn();

    // Default mock responses
    //
    // Note: iTerm2's `id of current window` returns a CGWindowID (e.g. 37529),
    // which is what `screencapture -l` expects as its window argument.
    mockExecPromise.mockImplementation((command: string) => {
      if (command.includes('osascript')) {
        return Promise.resolve({ stdout: '37529\n', stderr: '' });
      } else if (command.includes('screencapture')) {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    mockReadFile.mockResolvedValue(Buffer.from('fake-image-data'));
    mockUnlink.mockResolvedValue(undefined);

    // Create Screenshot with mock dependencies
    screenshot = new Screenshot(mockExecPromise, {
      readFile: mockReadFile,
      unlink: mockUnlink
    });
  });

  test('capture calls osascript and screencapture commands', async () => {
    await screenshot.capture();

    // Check that osascript was called
    const osascriptCalls = mockExecPromise.mock.calls.filter(call =>
      call[0].includes('osascript')
    );
    expect(osascriptCalls.length).toBeGreaterThan(0);

    // Check that screencapture was called
    const screencaptureCalls = mockExecPromise.mock.calls.filter(call =>
      call[0].includes('screencapture')
    );
    expect(screencaptureCalls.length).toBeGreaterThan(0);
  });

  test('capture returns result with correct structure', async () => {
    const result = await screenshot.capture();

    expect(result).toHaveProperty('base64Data');
    expect(result).toHaveProperty('mimeType', 'image/png');
    expect(result.base64Data).toBe('ZmFrZS1pbWFnZS1kYXRh'); // base64 of 'fake-image-data'
  });

  test('capture reads and cleans up temp file', async () => {
    await screenshot.capture();

    // Should read the temp file
    expect(mockReadFile).toHaveBeenCalled();
    const readPath = mockReadFile.mock.calls[0][0];
    expect(readPath).toMatch(/\/tmp\/iterm_mcp_screenshot_\d+\.png/);

    // Should unlink the temp file
    expect(mockUnlink).toHaveBeenCalled();
  });

  test('capture handles errors gracefully', async () => {
    mockExecPromise.mockRejectedValue(new Error('screencapture failed'));

    await expect(screenshot.capture()).rejects.toThrow('Failed to capture screenshot');

    // Should still try to clean up even on error
    expect(mockUnlink).toHaveBeenCalled();
  });

  test('capture ignores cleanup errors', async () => {
    mockExecPromise.mockRejectedValue(new Error('screencapture failed'));
    mockUnlink.mockRejectedValue(new Error('file not found'));

    // Should not throw cleanup errors
    await expect(screenshot.capture()).rejects.toThrow('Failed to capture screenshot');
  });

  test('capture uses screencapture -l<windowId> from iTerm window id', async () => {
    await screenshot.capture();

    const screencaptureCall = mockExecPromise.mock.calls.find(call =>
      call[0].includes('screencapture')
    );
    expect(screencaptureCall).toBeDefined();
    // Should capture by window id (covers overlapping windows) rather than by
    // screen region (which would miss content behind overlapping apps).
    expect(screencaptureCall[0]).toMatch(/screencapture -l37529/);
    expect(screencaptureCall[0]).not.toMatch(/-R/);
  });

  test('capture rejects non-numeric window id from AppleScript', async () => {
    mockExecPromise.mockImplementation((command: string) => {
      if (command.includes('osascript')) {
        return Promise.resolve({ stdout: 'not-a-number\n', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await expect(screenshot.capture()).rejects.toThrow(/Unexpected iTerm2 window id/);
  });
});

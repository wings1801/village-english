import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('../src/audio/tts', () => ({
  unlockAudio: vi.fn(() => {
    calls.push('unlock');
  }),
  speak: vi.fn((text: string, lang: string) => {
    calls.push(`speak:${text}:${lang}`);
    return Promise.resolve();
  }),
  listVoices: vi.fn(() => Promise.resolve([{ name: 'Kyoko', lang: 'ja-JP', localService: true }])),
}));

import { App } from '../src/app';
import { VoiceProbe } from '../src/ui/voice-probe';

describe('voice probe', () => {
  afterEach(() => {
    cleanup();
    calls.length = 0;
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('renders both speak buttons and the voice list container', async () => {
    render(<VoiceProbe />);
    expect(screen.getByText("Hello, I'm Mimi.")).toBeTruthy();
    expect(screen.getByText('こんにちは')).toBeTruthy();
    expect(screen.getByTestId('voice-list')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Kyoko/)).toBeTruthy());
  });

  it('is reachable at #/probe', async () => {
    window.location.hash = '#/probe';
    render(<App />);
    expect(screen.getByTestId('voice-list')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Kyoko/)).toBeTruthy());
  });

  it('tapping a speak button unlocks audio then speaks, with a clean console', async () => {
    const err = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    render(<VoiceProbe />);
    await waitFor(() => expect(screen.getByText(/Kyoko/)).toBeTruthy());
    fireEvent.click(screen.getByText('こんにちは'));
    await waitFor(() => expect(calls).toEqual(['unlock', 'speak:こんにちは:ja-JP']));
    fireEvent.click(screen.getByText("Hello, I'm Mimi."));
    expect(calls.slice(2)).toEqual(['unlock', "speak:Hello, I'm Mimi.:en-US"]);
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

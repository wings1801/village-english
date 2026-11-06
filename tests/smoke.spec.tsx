import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app';

describe('App', () => {
  it('shows the village by default', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.getByTestId('village')).toBeTruthy();
  });
});

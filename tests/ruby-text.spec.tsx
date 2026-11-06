import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { RubyText, parseRuby } from '../src/ui/ruby-text';

afterEach(cleanup);

describe('parseRuby', () => {
  it('returns plain text as one text part', () => {
    expect(parseRuby('えをみて')).toEqual([{ type: 'text', text: 'えをみて' }]);
  });

  it('parses a ruby element into base/rt pairs', () => {
    expect(parseRuby('これは<ruby>犬<rt>いぬ</rt></ruby>だよ')).toEqual([
      { type: 'text', text: 'これは' },
      { type: 'ruby', pairs: [{ base: '犬', rt: 'いぬ' }] },
      { type: 'text', text: 'だよ' },
    ]);
  });

  it('accepts optional rp and several base/rt pairs', () => {
    expect(parseRuby('<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rt>じ</rt></ruby>')).toEqual([
      {
        type: 'ruby',
        pairs: [
          { base: '漢', rt: 'かん' },
          { base: '字', rt: 'じ' },
        ],
      },
    ]);
  });
});

describe('RubyText', () => {
  it('renders real ruby/rt elements', () => {
    const { container } = render(<RubyText text="<ruby>犬<rt>いぬ</rt></ruby>をえらぼう" />);
    const ruby = container.querySelector('ruby')!;
    expect(ruby.textContent).toBe('犬いぬ');
    expect(ruby.querySelector('rt')!.textContent).toBe('いぬ');
    expect(container.textContent).toContain('をえらぼう');
  });

  it('shows an injected <img onerror> as inert text', () => {
    const { container } = render(<RubyText text={'a<img src=x onerror="window.__pwned=1">b'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('a<img src=x onerror="window.__pwned=1">b');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('shows <script> as inert text', () => {
    const { container } = render(<RubyText text={'<script>window.__pwned=1</script>ok'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('<script>window.__pwned=1</script>ok');
  });

  it('does not accept extra markup inside ruby', () => {
    const bad = '<ruby><img src=x onerror=1><rt>x</rt></ruby>';
    const { container } = render(<RubyText text={bad} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('ruby')).toBeNull();
    expect(container.textContent).toBe(bad);
  });

  it('does not accept attributes on ruby/rt', () => {
    const bad = '<ruby onclick="x">犬<rt>いぬ</rt></ruby>';
    const { container } = render(<RubyText text={bad} />);
    expect(container.querySelector('ruby')).toBeNull();
    expect(container.textContent).toBe(bad);
  });

  it('shows unbalanced or nested tags as inert text', () => {
    for (const bad of [
      '<ruby>犬<rt>いぬ</rt>',
      '<ruby><ruby>犬<rt>い</rt></ruby><rt>ぬ</rt></ruby>',
      '犬<rt>いぬ</ruby>',
    ]) {
      const { container, unmount } = render(<RubyText text={bad} />);
      expect(container.querySelector('rt')).toBeNull();
      expect(container.textContent).toBe(bad);
      unmount();
    }
  });

  it('shows rt outside ruby as inert text', () => {
    const { container } = render(<RubyText text="犬<rt>いぬ</rt>" />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('犬<rt>いぬ</rt>');
  });
});

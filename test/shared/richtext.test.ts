import { describe, expect, it } from 'vitest';
import { richToHtml, richToText } from '../../src/shared/richtext';

describe('richToHtml', () => {
  it('renders bold and escapes HTML', () => {
    expect(richToHtml('Call **now** <b>')).toBe('<p>Call <strong>now</strong> &lt;b&gt;</p>');
  });
  it('drops links with unsafe schemes', () => {
    expect(richToHtml('[site](javascript:alert(1))')).toBe('<p>site</p>');
  });
  it('renders https and tel links', () => {
    expect(richToHtml('[Action Fraud](https://www.actionfraud.police.uk)')).toBe(
      '<p><a href="https://www.actionfraud.police.uk">Action Fraud</a></p>',
    );
    expect(richToHtml('[Call](tel:01174729200)')).toBe('<p><a href="tel:01174729200">Call</a></p>');
  });
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(richToHtml('One\ntwo\n\nThree')).toBe('<p>One<br>two</p><p>Three</p>');
  });
  it('escapes quotes and ampersands', () => {
    expect(richToHtml(`O'Brien & "Co"`)).toBe('<p>O&#39;Brien &amp; &quot;Co&quot;</p>');
  });
});

describe('richToText', () => {
  it('writes links as text (url)', () => {
    expect(richToText('[Action Fraud](https://www.actionfraud.police.uk)')).toBe('Action Fraud (https://www.actionfraud.police.uk)');
  });
  it('strips bold markers and keeps characters unescaped', () => {
    expect(richToText("**Don't** <click>")).toBe("Don't <click>");
  });
});

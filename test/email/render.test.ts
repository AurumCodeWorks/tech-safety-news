import { describe, expect, it } from 'vitest';
import { renderCampaign } from '../../src/email/render';
import { base } from './fixture';

const recipient = {
  name: "Ann O'Brien <x>",
  unsubUrl: 'https://news.enhancedgroup.co.uk/u/abc',
  webUrl: 'https://news.enhancedgroup.co.uk/archive/2026-11-fake-parcel-texts',
};

describe('renderCampaign (email mode)', async () => {
  const { html, text } = await renderCampaign({ ...base, mode: 'email', recipient });

  it('renders all three alert cards with the approved colours', () => {
    expect(html).toContain('Scam alert');
    expect(html).toContain('Tip of the month');
    expect(html).toContain('Watch out');
    expect(html).toContain('#B0006A');
    expect(html).toContain('#006E96');
    expect(html).toContain('#FFF8B3');
  });

  it('uses table layout with inline CSS only', () => {
    expect(html).not.toMatch(/<div[^>]*style="[^"]*display:\s*(flex|grid)/);
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('oncontextmenu');
    expect(html).toContain('<!--[if mso]>');
  });

  it('gives every image alt, width and height', () => {
    const imgs = html.match(/<img[^>]*>/g)!;
    expect(imgs.length).toBeGreaterThan(5);
    for (const img of imgs) {
      expect(img).toMatch(/alt="[^"]+"/);
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
  });

  it('escapes the recipient name in HTML but not in text', () => {
    expect(html).toContain('Ann O&#39;Brien &lt;x&gt;');
    expect(html).not.toContain('<x>');
    expect(text).toContain("Hello Ann O'Brien <x>,");
  });

  it('includes the exact footer copy and company details', () => {
    expect(html).toContain('We will never ask for your password or bank details by email.');
    expect(html).toContain('This is a news-only email — replies aren’t read. If you’re worried about something, call us on 0117 472 9200.');
    expect(html).toContain('Company no. 13094854');
    expect(html).toContain('Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW');
  });

  it('includes the Cyber Essentials Plus registry badge without script attributes', () => {
    expect(html).toContain('registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/email-image/');
    expect(html).toContain('href="https://registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/active/?source=email"');
  });

  it('links the call bar to the phone number', () => {
    expect(html).toContain('href="tel:01174729200"');
    expect(html).toContain('Not sure? Call us on 0117 472 9200');
  });

  it('supports dark mode', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('[data-ogsc]');
    expect(html).toContain('email-logo-dark@2x.png');
  });

  it('renders rich text links and bold', () => {
    expect(html).toContain('<a href="https://www.actionfraud.police.uk"');
    expect(html).toContain('<strong>couldn’t</strong>');
  });

  it('includes personal links', () => {
    expect(html).toContain(recipient.unsubUrl);
    expect(html).toContain(recipient.webUrl);
    expect(text).toContain('Unsubscribe: https://news.enhancedgroup.co.uk/u/abc');
  });

  it('escapes the subject in the title', () => {
    expect(html).toContain('<title>Fake parcel texts &amp; other scams</title>');
  });

  it('renders a plain-text version of every block', () => {
    expect(text).toContain('SCAM ALERT: FAKE PARCEL DELIVERY TEXTS');
    expect(text).toContain('- You weren’t expecting a parcel');
    expect(text).toContain('Action Fraud (https://www.actionfraud.police.uk)');
    expect(text).toContain('TIP OF THE MONTH: AGREE A FAMILY PASSWORD');
    expect(text).toContain('WATCH OUT: WINDOWS UPDATE POP-UPS');
    expect(text).toContain('[Image: A fake delivery text]');
    expect(text).toContain('We will never ask for your password or bank details by email.');
  });
});

describe('renderCampaign (web mode)', async () => {
  const { html } = await renderCampaign({ ...base, mode: 'web' });
  it('has no personal links and supports the theme toggle', () => {
    expect(html).not.toContain('/u/');
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain('Hello,');
  });
});

describe('renderCampaign (mailgun batch mode)', async () => {
  const { html, text } = await renderCampaign({ ...base, mode: 'email', recipient: 'mailgun' });
  it('uses Mailgun recipient variables', () => {
    expect(html).toContain('%recipient.unsub_url%');
    expect(html).toContain('%recipient.web_url%');
    expect(html).toContain('%recipient.greeting_html%');
    expect(text).toContain('%recipient.greeting%');
    expect(text).toContain('Unsubscribe: %recipient.unsub_url%');
  });
});

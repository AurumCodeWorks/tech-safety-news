import type { CampaignContent } from '../../src/shared/blocks';
import type { Settings } from '../../src/shared/settings';

export const settings: Settings = {
  sender_name: 'Enhanced Group Tech Safety',
  phone: '0117 472 9200',
  legal_name: 'Enhanced Technology Solutions Ltd',
  company_number: '13094854',
  registered_office: 'Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW',
  ce_certificate_id: '79f52d13-3d5b-4e58-b17a-7e40adecb563',
};

export const content: CampaignContent = {
  subject: 'Fake parcel texts & other scams',
  preheader: 'Three things to watch for this month',
  blocks: [
    {
      id: 'b1',
      type: 'scam_alert',
      title: 'Fake parcel delivery texts',
      looksLike: 'A text says a parcel **couldn’t** be delivered and asks for a small fee.',
      warningSigns: ['You weren’t expecting a parcel', 'It asks for card details'],
      whatToDo: 'Delete it. Report it to [Action Fraud](https://www.actionfraud.police.uk).',
    },
    { id: 'b2', type: 'tip', title: 'Agree a family password', body: 'Pick a word only your family knows.' },
    { id: 'b3', type: 'warning', title: 'Windows update pop-ups', body: 'Real updates never ask you to phone a number.' },
    { id: 'b4', type: 'text', body: 'Thanks for reading.\n\nStay safe.' },
    { id: 'b5', type: 'image', r2Key: 'img/2026/10/abc.png', alt: 'A fake delivery text', caption: 'Example message', width: 1200, height: 800 },
    { id: 'b6', type: 'call_us', text: 'Not sure? Call us on {phone}' },
    { id: 'b7', type: 'divider' },
  ],
};

export const base = {
  content,
  settings,
  baseUrl: 'https://news.enhancedgroup.co.uk',
  issueDate: '2026-11-02T09:00:00.000Z',
};

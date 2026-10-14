import { useEffect, useState, type FormEvent } from 'react';
import type { Settings as SettingsShape } from '../../shared/settings';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';

const FIELDS: { key: keyof SettingsShape; label: string; hint?: string }[] = [
  { key: 'sender_name', label: 'Sender name', hint: 'Shown as the “From” name in people’s inboxes.' },
  { key: 'phone', label: 'Phone number', hint: 'Used in the “Call us” bar and the footer.' },
  { key: 'legal_name', label: 'Company legal name' },
  { key: 'company_number', label: 'Company number' },
  { key: 'registered_office', label: 'Registered office' },
  { key: 'ce_certificate_id', label: 'Cyber Essentials certificate ID', hint: 'Update this if the registry gives you a new ID on renewal.' },
];

export function Settings() {
  const { data, error } = useApi<SettingsShape>('/api/settings');
  const [form, setForm] = useState<SettingsShape | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    try {
      setForm(await api<SettingsShape>('/api/settings', { method: 'PUT', json: form }));
      setMessage({ tone: 'info', text: 'Settings saved' });
    } catch (err) {
      setMessage({ tone: 'danger', text: (err as Error).message });
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {form && (
        <form className="card stack" onSubmit={save}>
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`s-${f.key}`}>{f.label}</label>
              <input id={`s-${f.key}`} type="text" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              {f.hint && <span className="hint">{f.hint}</span>}
            </div>
          ))}
          <div className="row">
            <button type="submit" className="button primary">
              Save settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

import { IconCopy, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CampaignDto, CampaignSummary } from '../../shared/api-types';
import { formatLondon } from '../../shared/time';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';

const TABS = [
  { key: 'drafts', label: 'Drafts', match: (c: CampaignSummary) => c.status === 'draft' || c.status === 'failed' },
  { key: 'scheduled', label: 'Scheduled', match: (c: CampaignSummary) => c.status === 'scheduled' || c.status === 'sending' },
  { key: 'sent', label: 'Sent', match: (c: CampaignSummary) => c.status === 'sent' },
] as const;

const STATUS: Record<CampaignSummary['status'], string> = { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', failed: 'Needs attention' };

export function Emails() {
  const { data, error } = useApi<{ campaigns: CampaignSummary[] }>('/api/campaigns');
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('drafts');
  const navigate = useNavigate();

  const create = async (duplicateOf?: number) => {
    const c = await api<CampaignDto>('/api/campaigns', { method: 'POST', json: duplicateOf ? { duplicateOf } : { subject: '' } });
    navigate(`/emails/${c.id}`);
  };

  const current = TABS.find((t) => t.key === tab)!;
  const rows = data?.campaigns.filter(current.match) ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Emails</h1>
        <button type="button" className="button primary" onClick={() => create()}>
          <IconPlus size={18} aria-hidden="true" />
          New email
        </button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`button small ${tab === t.key ? 'primary' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {data && rows.length === 0 && <p className="muted">Nothing here yet.</p>}
      {rows.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Status</th>
              <th>When</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={c.status === 'sent' ? `/emails/${c.id}/stats` : `/emails/${c.id}`}>{c.subject || 'Untitled email'}</Link>
                </td>
                <td>
                  <span className={`badge ${c.status === 'failed' ? 'scam' : ''}`}>{STATUS[c.status]}</span>
                </td>
                <td className="muted">{c.sentAt ? formatLondon(c.sentAt) : c.scheduledAt ? formatLondon(c.scheduledAt) : formatLondon(c.updatedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="button small" onClick={() => create(c.id)}>
                    <IconCopy size={16} aria-hidden="true" />
                    Duplicate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

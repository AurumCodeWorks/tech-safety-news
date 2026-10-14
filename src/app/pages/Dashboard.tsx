import { Link } from 'react-router';
import type { CampaignStats, StatusDto } from '../../shared/api-types';
import { formatLondon } from '../../shared/time';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';

export function StatTiles({ stats }: { stats: CampaignStats }) {
  const tiles: [string, number][] = [
    ['Sent', stats.sent],
    ['Delivered', stats.delivered],
    ['Opened (estimate)', stats.opened],
    ['Bounced', stats.bounced],
    ['Complained', stats.complained],
    ['Unsubscribed', stats.unsubscribed],
  ];
  return (
    <div className="grid">
      {tiles.map(([label, value]) => (
        <div className="metric" key={label}>
          <div className="label">{label}</div>
          <div className="value">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data, error } = useApi<StatusDto>('/api/status');
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link className="button primary" to="/emails">
          Write an email
        </Link>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {data?.mailgunDomain === 'unverified' && (
        <Banner tone="danger">Mailgun hasn’t verified news.enhancedgroup.co.uk yet — sending is switched off</Banner>
      )}
      {data?.mailgunDomain === 'unknown' && (
        <Banner>
          Your Mailgun key can only send, so this app can’t check the domain automatically. Always confirm your test email arrives before
          sending.
        </Banner>
      )}
      <section className="card">
        <h2>Next scheduled</h2>
        {data?.nextScheduled ? (
          <p>
            <Link to={`/emails/${data.nextScheduled.id}`}>{data.nextScheduled.subject}</Link>
            <br />
            <span className="muted">{formatLondon(data.nextScheduled.scheduledAt)}</span>
          </p>
        ) : (
          <p className="muted">Nothing scheduled.</p>
        )}
      </section>
      <section className="card">
        <h2>Last sent</h2>
        {data?.lastSent ? (
          <div className="stack">
            <p>
              <Link to={`/emails/${data.lastSent.id}/stats`}>{data.lastSent.subject}</Link>
              <br />
              <span className="muted">{formatLondon(data.lastSent.sentAt)}</span>
            </p>
            <StatTiles stats={data.lastSent.stats} />
          </div>
        ) : (
          <p className="muted">No emails sent yet.</p>
        )}
      </section>
    </div>
  );
}

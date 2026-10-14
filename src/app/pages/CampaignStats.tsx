import { Link, useParams } from 'react-router';
import type { CampaignDto, CampaignStats as Stats } from '../../shared/api-types';
import { formatLondon } from '../../shared/time';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';
import { StatTiles } from './Dashboard';

export function CampaignStats() {
  const id = Number(useParams().id);
  const { data: campaign } = useApi<CampaignDto>(`/api/campaigns/${id}`);
  const { data: stats, error } = useApi<Stats>(`/api/campaigns/${id}/stats`);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{campaign?.subject ?? 'Results'}</h1>
        <div className="row">
          {campaign?.slug && (
            <a className="button" href={`/archive/${campaign.slug}`} target="_blank" rel="noreferrer">
              View in archive
            </a>
          )}
          <Link className="button" to="/emails">
            All emails
          </Link>
        </div>
      </div>
      {campaign?.sentAt && <p className="muted">Sent {formatLondon(campaign.sentAt)}</p>}
      {error && <Banner tone="danger">{error}</Banner>}
      {stats && (
        <>
          <StatTiles stats={stats} />
          <p className="muted">Opens are an estimate — some email apps hide opens.</p>
          {stats.problems.length > 0 && (
            <table className="list">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Problem</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {stats.problems.map((p) => (
                  <tr key={p.email}>
                    <td>{p.email}</td>
                    <td>{p.status === 'complained' ? 'Marked as spam' : 'Bounced'}</td>
                    <td className="muted">{p.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

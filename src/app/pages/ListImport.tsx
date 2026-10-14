import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';
import type { ListSummary } from './Lists';

type Mapping = { email: string; name?: string };
type Preview = {
  parse: { rows: unknown[]; invalid: { line: number; value: string }[]; duplicatesInFile: number; columns: string[]; mapping: Mapping | null };
  diff: { added: string[]; removed: string[]; unchanged: number; suppressed: string[] };
};

export function ListImport() {
  const { id } = useParams();
  const listId = id ? Number(id) : null;
  const navigate = useNavigate();
  const { data: lists } = useApi<{ lists: ListSummary[] }>('/api/lists');
  const existing = lists?.lists.find((l) => l.id === listId);

  const [name, setName] = useState('');
  const [csv, setCsv] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | undefined>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [removeMissing, setRemoveMissing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const runPreview = async (text: string, m?: Mapping) => {
    setError(null);
    try {
      setPreview(await api<Preview>('/api/lists/import/preview', { method: 'POST', json: { listId: listId ?? undefined, csv: text, mapping: m } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setMapping(undefined);
    await runPreview(text);
  };

  const chooseColumn = async (key: 'email' | 'name', value: string) => {
    const next = { ...(mapping ?? { email: '' }), [key]: value || undefined } as Mapping;
    setMapping(next);
    if (csv && next.email) await runPreview(csv, next);
  };

  const save = async () => {
    if (!csv) return;
    if (listId === null && !name.trim()) {
      setError('Give the new list a name');
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ listId: number }>('/api/lists/import/commit', {
        method: 'POST',
        json: { listId: listId ?? undefined, name: listId === null ? name.trim() : undefined, csv, mapping, removeMissing: listId === null ? true : removeMissing },
      });
      navigate(`/lists/${res.listId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The list couldn’t be saved. Try again.');
      setSaving(false);
    }
  };

  const unmapped = preview && preview.parse.mapping === null && !mapping?.email;
  const d = preview?.diff;
  const summary = d
    ? `+${d.added.length} new, −${listId === null ? 0 : d.removed.length} not in file, ${d.unchanged} unchanged, ${preview!.parse.invalid.length} invalid, ${d.suppressed.length} suppressed`
    : null;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{listId === null ? 'Import a new list' : `Update ${existing?.name ?? 'list'}`}</h1>
        <Link className="button" to="/lists">
          Back to lists
        </Link>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="card stack">
        {listId === null && (
          <div className="field">
            <label htmlFor="list-name">List name</label>
            <input id="list-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Clients – Main" />
          </div>
        )}
        <div className="field">
          <label htmlFor="csv-file">CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} />
          <span className="hint">In Office 365, export the distribution list’s members as a CSV and choose that file.</span>
        </div>

        {(unmapped || (preview && preview.parse.mapping === null)) && (
          <div className="stack">
            <Banner>We couldn’t find an email column. Choose which columns to use.</Banner>
            <div className="row">
              <div className="field" style={{ minWidth: 220 }}>
                <label htmlFor="col-email">Email column</label>
                <select id="col-email" value={mapping?.email ?? ''} onChange={(e) => chooseColumn('email', e.target.value)}>
                  <option value="">Choose…</option>
                  {preview!.parse.columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ minWidth: 220 }}>
                <label htmlFor="col-name">Name column</label>
                <select id="col-name" value={mapping?.name ?? ''} onChange={(e) => chooseColumn('name', e.target.value)}>
                  <option value="">None</option>
                  {preview!.parse.columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {summary && !unmapped && (
          <div className="stack">
            <p>
              <strong>{summary}</strong>
            </p>
            {preview!.parse.invalid.length > 0 && (
              <details>
                <summary>Show invalid rows</summary>
                <ul>
                  {preview!.parse.invalid.map((r) => (
                    <li key={r.line}>{`Line ${r.line}: ${r.value || '(empty)'}`}</li>
                  ))}
                </ul>
              </details>
            )}
            {listId !== null && (
              <label className="row">
                <input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
                Remove people not in this file
              </label>
            )}
            <div className="row">
              <button type="button" className="button primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save list'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

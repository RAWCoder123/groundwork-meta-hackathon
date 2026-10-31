'use client';
import type {AutoProject} from '../autonomy/types';

type Status = 'open' | 'requested' | 'received';
type Owner = 'client' | 'architect' | 'engineer';
type Entry = {status: Status; owner: Owner; documentId: string | null};

const statuses: Status[] = ['open', 'requested', 'received'];
const owners: Owner[] = ['client', 'architect', 'engineer'];
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const blank: Entry = {status: 'open', owner: 'client', documentId: null};

export function MissingInfoTracker({items, project, projectPath, busy, action}: {
  items: string[];
  project: AutoProject;
  projectPath: string;
  busy: boolean;
  action: (path: string, body?: unknown, method?: string) => Promise<unknown>;
}) {
  const tracker = ((project as unknown as {infoTracker?: Record<string, Entry>}).infoTracker) || {};
  const entry = (item: string): Entry => ({...blank, ...tracker[item]});
  const received = items.filter(i => entry(i).status === 'received').length;
  const update = (item: string, patch: Partial<Entry>) =>
    void action(`${projectPath}/info-item`, {item, ...entry(item), ...patch});

  return (
    <div className="sa-tracker">
      <div className="sa-tracker-progress" aria-label={`${received} of ${items.length} received`}>
        <div className="sa-tracker-bar"><i style={{width: `${items.length ? (received / items.length) * 100 : 0}%`}} /></div>
        <span>{received} of {items.length} received</span>
      </div>
      <ul className="sa-tracker-list">
        {items.map(item => {
          const e = entry(item);
          return (
            <li key={item} className={`sa-tracker-item ${e.status}`}>
              <p>{item}</p>
              <div className="sa-tracker-controls">
                <select aria-label="Status" disabled={busy} value={e.status}
                  onChange={ev => update(item, {status: ev.target.value as Status})}>
                  {statuses.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
                <select aria-label="Owner" disabled={busy} value={e.owner}
                  onChange={ev => update(item, {owner: ev.target.value as Owner})}>
                  {owners.map(o => <option key={o} value={o}>{cap(o)}</option>)}
                </select>
                <select aria-label="Linked file" disabled={busy} value={e.documentId ?? ''}
                  onChange={ev => update(item, {documentId: ev.target.value || null})}>
                  <option value="">No file linked</option>
                  {project.documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
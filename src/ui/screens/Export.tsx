import { tr } from '../strings';
import { download, type App } from '../useApp';
import { EmptyRun } from './common';

export function ExportScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  if (!res) return <EmptyRun app={app} />;
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const files = sw ? app.files.filter((f) => f.audience === sw) : app.files;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'ex.title')}</h1>
          <p className="sub">{tr(lang, 'ex.sub')}</p>
        </div>
        {files.length > 1 && (
          <button type="button" className="btn primary" onClick={() => files.forEach((f, i) => setTimeout(() => download(f.name, f.buffer), i * 400))}>
            {tr(lang, 'ex.downloadAll')}
          </button>
        )}
      </div>
      <section className="panel scroll-x">
        <table className="t" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col">{tr(lang, 'ex.col.file')}</th>
              <th scope="col">{tr(lang, 'ex.col.for')}</th>
              <th scope="col">{tr(lang, 'ex.col.contents')}</th>
              <th scope="col">
                <span className="sr">{tr(lang, 'ex.download')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span aria-hidden="true" style={{ fontSize: 10, fontWeight: 600, padding: '3px 5px', borderRadius: 4, background: '#EAF5EE', color: '#145F35' }}>
                      XLSX
                    </span>
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      {f.name}
                    </span>
                  </span>
                </td>
                <td style={{ fontWeight: 500 }}>{f.audience === 'management' ? tr(lang, 'ex.mgmt') : f.audience}</td>
                <td style={{ color: 'var(--ink-2)' }}>{f.sheets.join(', ')}</td>
                <td className="r">
                  <button type="button" className="btn small" onClick={() => download(f.name, f.buffer)}>
                    {tr(lang, 'ex.download')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

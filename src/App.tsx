import { fmt } from './engine/dates';
import { Icon } from './ui/icons';
import { CallsScreen } from './ui/screens/Calls';
import { ClientsScreen } from './ui/screens/Clients';
import { ExportScreen } from './ui/screens/Export';
import { GoalScreen } from './ui/screens/Goal';
import { OverviewScreen } from './ui/screens/Overview';
import { QualityScreen } from './ui/screens/Quality';
import { RulesDrawer } from './ui/screens/Rules';
import { PatternsScreen } from './ui/screens/Patterns';
import { RunScreen } from './ui/screens/Run';
import { SituationScreen } from './ui/screens/Situation';
import { tr, type UiKey } from './ui/strings';
import { useApp, type App as AppT, type Screen } from './ui/useApp';
import { useAiStatus } from './ui/useAi';

function NavItem({ app, id, label, icon, count, red, dot, disabled }: { app: AppT; id: Screen; label: UiKey; icon: () => React.ReactElement; count?: number; red?: boolean; dot?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="nav-item" aria-current={app.screen === id ? 'page' : undefined} onClick={() => app.setScreen(id)} disabled={disabled}>
      {icon()}
      <span>{tr(app.lang, label)}</span>
      {count !== undefined && <span className={`nav-count${red ? ' red' : ''}`}>{count}</span>}
      {dot && <span className="nav-dot" aria-label="!" />}
    </button>
  );
}

const initials = (n: string) =>
  n
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function App() {
  const app = useApp();
  const ai = useAiStatus(app.rules.ai.endpoint);
  const { lang, result } = app;
  const swName = app.role.kind === 'sw' ? app.role.name : undefined;
  const callCount = result ? (swName ? (result.callLists[swName]?.length ?? 0) : Object.values(result.callLists).reduce((s, l) => s + l.length, 0)) : undefined;
  const alertCount = result
    ? swName
      ? result.alerts.filter((a) => a.personId && result.persons.find((p) => p.id === a.personId)?.socialWorker === swName).length
      : result.alerts.length
    : undefined;
  const crumbKey: Record<Screen, UiKey> = {
    run: 'nav.run',
    overview: 'nav.overview',
    goal: 'nav.goal',
    calls: 'nav.calls',
    clients: 'nav.clients',
    quality: 'nav.quality',
    export: 'nav.export',
    situation: 'nav.situation',
    patterns: 'nav.patterns',
  };
  const noRun = !result;

  return (
    <div className="app">
      {app.raws.length > 0 && (
        <div className={`demo-strip${app.isDemo ? '' : ' own'}`} role="status">
          <span>{tr(lang, app.isDemo ? 'demo.strip' : 'own.strip')}</span>
          <span style={{ opacity: 0.9 }}>{tr(lang, 'demo.local')}</span>
        </div>
      )}
      <div className="layout">
        <nav className="sidebar" aria-label="Main">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              IC
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="brand-name">{tr(lang, 'app.name')}</span>
              <span className="brand-sub">{tr(lang, 'app.org')}</span>
            </div>
          </div>
          <div className="nav-group">
            <span className="overline">{tr(lang, 'nav.cockpit')}</span>
            <NavItem app={app} id="overview" label="nav.overview" icon={Icon.overview} disabled={noRun} />
            <NavItem app={app} id="goal" label="nav.goal" icon={Icon.target} disabled={noRun} />
            <NavItem app={app} id="calls" label="nav.calls" icon={Icon.calls} count={callCount} red disabled={noRun} />
            <NavItem app={app} id="clients" label="nav.clients" icon={Icon.clients} count={app.visible?.persons.length} disabled={noRun} />
            <NavItem app={app} id="patterns" label="nav.patterns" icon={Icon.patterns} disabled={noRun} />
          </div>
          <div className="nav-group">
            <span className="overline">{tr(lang, 'nav.data')}</span>
            <NavItem app={app} id="run" label="nav.run" icon={Icon.run} dot={app.blocked} />
            <NavItem app={app} id="situation" label="nav.situation" icon={Icon.doc} count={app.sa.reports.filter((r) => r.newThisMonth && (!swName || r.socialWorker === swName)).length || undefined} />
            <NavItem app={app} id="quality" label="nav.quality" icon={Icon.quality} count={alertCount} disabled={noRun} />
            <NavItem app={app} id="export" label="nav.export" icon={Icon.download} count={result ? (swName ? 1 : app.files.length) : undefined} disabled={noRun} />
          </div>
          <div className="sidebar-bottom">
            <span className="overline">{tr(lang, 'nav.viewing')}</span>
            <button type="button" className="role-row" aria-pressed={app.role.kind === 'mgmt'} onClick={() => app.setRole({ kind: 'mgmt' })}>
              <span className="avatar" aria-hidden="true">
                L
              </span>
              <span className="role-text">
                <span style={{ fontWeight: 500 }}>{tr(lang, 'role.mgmt')}</span>
                <small>{tr(lang, 'role.mgmt.sub')}</small>
              </span>
              {app.role.kind === 'mgmt' && <span style={{ marginLeft: 'auto' }}>{Icon.check()}</span>}
            </button>
            <div className="role-row" aria-pressed={app.role.kind === 'sw'} style={{ cursor: 'default' }}>
              <span className="avatar blue" aria-hidden="true">
                {swName ? initials(swName) : 'SA'}
              </span>
              <span className="role-text" style={{ flex: 1 }}>
                <label htmlFor="role-sw" className="sr">
                  {tr(lang, 'role.pick')}
                </label>
                <select
                  id="role-sw"
                  className="input"
                  style={{ height: 28, padding: '0 6px', fontSize: 13 }}
                  value={swName ?? ''}
                  disabled={!result}
                  onChange={(e) => (e.target.value ? app.setRole({ kind: 'sw', name: e.target.value }) : app.setRole({ kind: 'mgmt' }))}
                >
                  <option value="">{tr(lang, 'role.pick')}</option>
                  {(result?.socialWorkers ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <small>{tr(lang, 'role.sw.sub')}</small>
              </span>
            </div>
            <div className="ai-status">
              <span className="dot" style={{ background: ai === 'online' ? '#1A7F45' : ai === 'offline' ? '#A1A1AA' : '#D6D4CF' }} aria-hidden="true" />
              <span>{tr(lang, ai === 'online' ? 'ai.online' : ai === 'offline' ? 'ai.offline' : 'ai.unknown')}</span>
            </div>
            <p style={{ margin: 0, padding: '0 10px', fontSize: 11.5, lineHeight: 1.4, color: 'var(--muted)' }}>{tr(lang, 'privacy')}</p>
          </div>
        </nav>

        <main className="main">
          <div className="topbar">
            <div className="crumb">
              <span className="muted">{tr(lang, 'nav.cockpit')}</span>
              <span aria-hidden="true" style={{ color: 'var(--faint)' }}>
                /
              </span>
              <span style={{ fontWeight: 500 }}>{tr(lang, crumbKey[app.screen])}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span className="chip">
                {Icon.calendar()} {tr(lang, result ? 'top.stichtag' : 'top.lastrun')}{' '}
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  {result ? fmt(result.stichtag) : '–'}
                </span>
              </span>
              {app.source && app.source.kind !== 'files' && (
                <button type="button" className="chip" title={tr(lang, 'src.locked.sub')} onClick={() => app.setScreen('run')}>
                  {tr(lang, 'src.chip')}{' '}
                  <span style={{ color: 'var(--ink)' }}>
                    {app.source.kind === 'sample' ? tr(lang, 'src.sample', { month: app.source.month.split('-').reverse().join('.') }) : tr(lang, 'src.folder', { name: app.source.name })}
                  </span>
                </button>
              )}
              <button type="button" className="chip" onClick={() => app.setRulesOpen(true)}>
                rules.yaml{' '}
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  v{app.rules.version}
                </span>
                {app.customRules && <span className="tag warn">{tr(lang, 'rules.custom')}</span>}
              </button>
              <div className="lang-toggle" role="group" aria-label="Sprache / Language">
                <button type="button" aria-pressed={lang === 'de'} onClick={() => app.setLang('de')}>
                  DE
                </button>
                <button type="button" aria-pressed={lang === 'en'} onClick={() => app.setLang('en')}>
                  EN
                </button>
              </div>
            </div>
          </div>
          <div className="content">
            <div className="page">
              {app.screen === 'run' && <RunScreen app={app} />}
              {app.screen === 'overview' && <OverviewScreen app={app} />}
              {app.screen === 'goal' && <GoalScreen app={app} />}
              {app.screen === 'calls' && <CallsScreen app={app} />}
              {app.screen === 'clients' && <ClientsScreen app={app} />}
              {app.screen === 'quality' && <QualityScreen app={app} />}
              {app.screen === 'export' && <ExportScreen app={app} />}
              {app.screen === 'patterns' && <PatternsScreen app={app} />}
              {app.screen === 'situation' && <SituationScreen app={app} aiOnline={ai === 'online'} />}
            </div>
          </div>
        </main>
      </div>
      {app.rulesOpen && <RulesDrawer app={app} />}
    </div>
  );
}

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ChevronRight, Download, Sparkles, Target, Trash2, Upload, UserCog } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Segmented, Sheet } from '../components/ui';
import { aiReady } from '../lib/ai';
import { ACTIVITY, GOALS } from '../lib/nutrition';
import { fmt, todayKey } from '../lib/util';
import { push } from '../router';
import { type ThemePref, exportData, useCurrentWeight, useStore, useTargets, useUi } from '../store';

function Row({ icon, title, sub, onClick, danger }: { icon: ReactNode; title: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className="list-item" onClick={onClick}>
      <span className="badge" style={danger ? { background: 'color-mix(in srgb, var(--critical) 14%, transparent)', color: 'var(--critical)' } : undefined}>
        {icon}
      </span>
      <div className="grow">
        <div className="name" style={danger ? { color: 'var(--critical)' } : undefined}>
          {title}
        </div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {!danger && <ChevronRight size={20} color="var(--text-3)" />}
    </button>
  );
}

async function saveBackup(): Promise<string> {
  const name = `healty-respaldo-${todayKey()}.json`;
  const data = exportData();
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Respaldo de Healty', files: [file.uri] });
    return 'Respaldo listo para guardar o compartir';
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Respaldo descargado';
}

export default function Profile() {
  const profile = useStore((s) => s.profile)!;
  const ai = useStore((s) => s.ai);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const override = useStore((s) => s.targetsOverride);
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const showToast = useUi((s) => s.showToast);
  const targets = useTargets();
  const weight = useCurrentWeight();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<unknown>(null);

  const onExport = async () => {
    try {
      showToast(await saveBackup());
    } catch (e) {
      // El usuario puede cerrar el diálogo de compartir sin elegir nada.
      if (!(e instanceof Error && /cancel/i.test(e.message))) showToast('No se pudo crear el respaldo');
    }
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { entries?: unknown }).entries)) throw new Error('formato');
      setPendingImport(parsed);
    } catch {
      showToast('El archivo no es un respaldo válido de Healty');
    }
  };

  return (
    <div className="screen with-tabs">
      <h1 className="title-xl">Perfil</h1>

      <div className="card col">
        <div className="row">
          <span className="avatar" style={{ width: 54, height: 54, fontSize: 22 }} aria-hidden>
            {(profile.name || 'H').charAt(0).toUpperCase()}
          </span>
          <div className="grow">
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>{profile.name || 'Tu perfil'}</h2>
            <p className="small muted num">
              {profile.age} años · {fmt(profile.heightCm)} cm · {fmt(weight, 1)} kg · Actividad: {ACTIVITY[profile.activity].label.toLowerCase()}
            </p>
          </div>
        </div>
        <div className="row spread">
          <div className="stat">
            <span className="v">{GOALS[profile.goal].label}</span>
            <span className="l">Objetivo</span>
          </div>
          <div className="stat" style={{ textAlign: 'right' }}>
            <span className="v num">{fmt(targets.kcal)} kcal</span>
            <span className="l num">
              P {targets.protein} · C {targets.carbs} · G {targets.fat} g
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="list">
          <Row icon={<UserCog size={20} />} title="Datos y objetivo" sub="Peso, actividad, definición o volumen" onClick={() => push('/edit-profile')} />
          <Row icon={<Target size={20} />} title="Metas de calorías y macros" sub={override ? 'Personalizadas' : 'Calculadas automáticamente'} onClick={() => push('/targets')} />
          <Row
            icon={<Sparkles size={20} />}
            title="Inteligencia artificial"
            sub={aiReady(ai) ? `Activa · ${ai.provider === 'gemini' ? 'Google Gemini' : 'Claude'}` : 'Sin configurar: necesaria para la foto con IA'}
            onClick={() => push('/ai')}
          />
        </div>
      </div>

      <div className="card col">
        <h2 className="card-title">Apariencia</h2>
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </div>

      <div className="card">
        <h2 className="card-title">Tus datos</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Todo se guarda solo en este teléfono. Haz un respaldo de vez en cuando para no perder tu historial si cambias de equipo o reinstalas la app.
        </p>
        <div className="list">
          <Row icon={<Download size={20} />} title="Crear respaldo" sub="Guarda un archivo con todo tu historial" onClick={() => void onExport()} />
          <Row icon={<Upload size={20} />} title="Restaurar respaldo" sub="Reemplaza los datos actuales por los del archivo" onClick={() => fileRef.current?.click()} />
          <Row icon={<Trash2 size={20} />} title="Borrar todos los datos" onClick={() => setConfirmReset(true)} danger />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <p className="xs muted center">
        Healty 1.0 · Los valores nutricionales son estimaciones y la app no reemplaza el consejo de un profesional de la salud. Datos de productos: Open Food Facts.
      </p>

      {pendingImport !== null && (
        <Sheet title="¿Restaurar este respaldo?" onClose={() => setPendingImport(null)}>
          <p className="small muted">Se reemplazarán tu perfil, diario, pesos y entrenamientos actuales por los del archivo. Esta acción no se puede deshacer.</p>
          <button
            className="btn"
            onClick={() => {
              try {
                importData(pendingImport);
                showToast('Respaldo restaurado');
              } catch {
                showToast('El archivo no es un respaldo válido de Healty');
              }
              setPendingImport(null);
            }}
          >
            Restaurar
          </button>
          <button className="btn secondary" onClick={() => setPendingImport(null)}>
            Cancelar
          </button>
        </Sheet>
      )}

      {confirmReset && (
        <Sheet title="¿Borrar todos los datos?" onClose={() => setConfirmReset(false)}>
          <p className="small muted">Se eliminarán tu perfil, diario, pesos, rutina, entrenamientos y claves de IA de este teléfono. Esta acción no se puede deshacer.</p>
          <button
            className="btn danger"
            onClick={() => {
              resetAll();
              setConfirmReset(false);
            }}
          >
            Borrar todo
          </button>
          <button className="btn secondary" onClick={() => setConfirmReset(false)}>
            Cancelar
          </button>
        </Sheet>
      )}
    </div>
  );
}

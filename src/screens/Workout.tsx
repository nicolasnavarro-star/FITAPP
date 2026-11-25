import { Check, Info, Minus, PlayCircle, Plus, Timer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Header, Sheet } from '../components/ui';
import { getExercise, videoUrl } from '../lib/exercises';
import { fmt, formatDate, parseNum } from '../lib/util';
import { back, backToRoot } from '../router';
import { lastPerformance, useStore, useUi } from '../store';

function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Campo numérico que conserva lo que se escribe (por ejemplo "12," mientras se teclea un decimal). */
function NumInput({ value, onChange, ...rest }: { value: number | null; onChange: (v: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const show = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(show(value));
  useEffect(() => {
    setText((t) => (parseNum(t) === value ? t : show(value)));
  }, [value]);
  return (
    <input
      {...rest}
      className="set-input num"
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNum(e.target.value);
        onChange(n !== null && n >= 0 ? n : null);
      }}
    />
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function Workout() {
  const aw = useStore((s) => s.activeWorkout);
  const workouts = useStore((s) => s.workouts);
  const updateSet = useStore((s) => s.updateSet);
  const addSet = useStore((s) => s.addSet);
  const removeSet = useStore((s) => s.removeSet);
  const finishWorkout = useStore((s) => s.finishWorkout);
  const cancelWorkout = useStore((s) => s.cancelWorkout);
  const showToast = useUi((s) => s.showToast);
  const now = useNow(1000);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | 'finish' | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const leaving = useRef(false);

  useEffect(() => {
    // Si se abre esta pantalla sin un entrenamiento en curso, se vuelve atrás.
    if (!aw && !leaving.current) back();
  }, [aw]);

  const restLeft = restEnd !== null ? (restEnd - now) / 1000 : 0;
  useEffect(() => {
    if (restEnd !== null && restLeft <= 0) {
      navigator.vibrate?.([200, 100, 200]);
      setRestEnd(null);
    }
  }, [restEnd, restLeft]);

  if (!aw) return null;

  const doneSets = aw.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0);
  const totalSets = aw.items.reduce((a, it) => a + it.sets.length, 0);

  const finish = () => {
    leaving.current = true;
    const log = finishWorkout();
    showToast(log ? `¡Entrenamiento guardado! ${log.durationMin} min` : 'Entrenamiento descartado: no había series completadas');
    backToRoot();
  };

  const infoEx = info ? getExercise(info) : null;

  return (
    <>
      <div className="screen with-footer">
        <Header
          title={aw.dayName}
          right={
            <>
              <span className="chip num" aria-label="Tiempo transcurrido">
                <Timer size={15} /> {clock((now - aw.startedAt) / 1000)}
              </span>
              <button className="icon-btn" aria-label="Descartar entrenamiento" onClick={() => setConfirm('cancel')}>
                <X size={22} />
              </button>
            </>
          }
        />
        <div className="progress-track" role="progressbar" aria-label="Series completadas" aria-valuenow={doneSets} aria-valuemax={totalSets}>
          <div style={{ width: `${totalSets > 0 ? (doneSets / totalSets) * 100 : 0}%` }} />
        </div>

        {aw.items.map((item, ii) => {
          const ex = getExercise(item.exerciseId);
          const prev = lastPerformance(workouts, item.exerciseId);
          const best = prev?.sets.reduce((a, s) => ((s.kg ?? 0) > (a.kg ?? 0) ? s : a), prev.sets[0]);
          return (
            <div className="card col" key={ii}>
              <div className="row spread">
                <div className="grow">
                  <h2 className="card-title">{ex.name}</h2>
                  <p className="small muted num">
                    {item.target.sets} × {item.target.reps} · descanso {item.target.restSec} s
                  </p>
                </div>
                <button className="icon-btn" aria-label={`Cómo hacer ${ex.name}`} onClick={() => setInfo(ex.id)}>
                  <Info size={20} color="var(--text-3)" />
                </button>
              </div>
              {prev && best && (
                <p className="xs muted num">
                  Última vez ({formatDate(prev.date)}): {best.kg ? `${fmt(best.kg, 1)} kg × ` : ''}
                  {best.reps ?? '—'} {ex.timed ? 's' : 'reps'}
                </p>
              )}
              <div className="set-row xs muted" style={{ fontWeight: 600 }}>
                <span className="center">#</span>
                <span className="center">Peso (kg)</span>
                <span className="center">{ex.timed ? 'Segundos' : 'Repeticiones'}</span>
                <span />
              </div>
              {item.sets.map((set, si) => (
                <div className="set-row" key={si}>
                  <span className="idx num">{si + 1}</span>
                  <NumInput
                    inputMode="decimal"
                    placeholder={ex.eq === 'bw' ? 'Corporal' : '0'}
                    aria-label={`${ex.name}, serie ${si + 1}, peso en kilos`}
                    value={set.kg}
                    onChange={(kg) => updateSet(ii, si, { kg })}
                  />
                  <NumInput
                    inputMode="numeric"
                    placeholder={item.target.reps.replace(' s', '')}
                    aria-label={`${ex.name}, serie ${si + 1}, ${ex.timed ? 'segundos' : 'repeticiones'}`}
                    value={set.reps}
                    onChange={(reps) => updateSet(ii, si, { reps })}
                  />
                  <button
                    className={`check ${set.done ? 'done' : ''}`}
                    aria-label={`${ex.name}, serie ${si + 1}: ${set.done ? 'completada' : 'marcar como completada'}`}
                    aria-pressed={set.done}
                    onClick={() => {
                      updateSet(ii, si, { done: !set.done });
                      if (!set.done) setRestEnd(Date.now() + item.target.restSec * 1000);
                    }}
                  >
                    <Check size={22} />
                  </button>
                </div>
              ))}
              <div className="row">
                <button className="btn sm secondary grow" onClick={() => addSet(ii)}>
                  <Plus size={16} /> Serie
                </button>
                <button className="btn sm secondary grow" disabled={item.sets.length <= 1} onClick={() => removeSet(ii)}>
                  <Minus size={16} /> Serie
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {restEnd !== null && restLeft > 0 && (
        <div className="rest-bar" role="timer">
          <Timer size={20} />
          <span className="grow num">Descanso {clock(restLeft)}</span>
          <button onClick={() => setRestEnd(restEnd + 30000)}>+30 s</button>
          <button onClick={() => setRestEnd(null)}>Omitir</button>
        </div>
      )}

      <div className="footer-bar">
        <button className="btn" onClick={() => (doneSets < totalSets ? setConfirm('finish') : finish())}>
          Finalizar entrenamiento
        </button>
      </div>

      {confirm === 'cancel' && (
        <Sheet title="¿Descartar este entrenamiento?" onClose={() => setConfirm(null)}>
          <p className="small muted">Se perderán las series que marcaste en esta sesión.</p>
          <button
            className="btn danger"
            onClick={() => {
              leaving.current = true;
              cancelWorkout();
              backToRoot();
            }}
          >
            Descartar
          </button>
          <button className="btn secondary" onClick={() => setConfirm(null)}>
            Seguir entrenando
          </button>
        </Sheet>
      )}
      {confirm === 'finish' && (
        <Sheet title="¿Finalizar ahora?" onClose={() => setConfirm(null)}>
          <p className="small muted num">
            Completaste {doneSets} de {totalSets} series. Solo se guardarán las series marcadas.
          </p>
          <button className="btn" onClick={finish}>
            Finalizar y guardar
          </button>
          <button className="btn secondary" onClick={() => setConfirm(null)}>
            Seguir entrenando
          </button>
        </Sheet>
      )}
      {infoEx && (
        <Sheet title={infoEx.name} onClose={() => setInfo(null)}>
          <p className="small muted">{infoEx.muscle}</p>
          <div className="card small">{infoEx.tips}</div>
          <a className="btn sm" href={videoUrl(infoEx.name)} target="_blank" rel="noreferrer">
            <PlayCircle size={18} /> Ver video de referencia
          </a>
        </Sheet>
      )}
    </>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BarChart, LineChart } from '../components/charts';
import { Field, Segmented, Sheet } from '../components/ui';
import { GOALS, bmi, bmiLabel, sumEntries, weeksToGoal } from '../lib/nutrition';
import { addDays, clamp, daysBetween, fmt, formatDate, parseNum, todayKey, weekdayShort } from '../lib/util';
import { useCurrentWeight, useStore, useTargets, useUi } from '../store';

type Range = '30' | '90' | 'all';

export default function Progress() {
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const entries = useStore((s) => s.entries);
  const removeWeight = useStore((s) => s.removeWeight);
  const targets = useTargets();
  const weight = useCurrentWeight();
  const [range, setRange] = useState<Range>('90');
  const [logging, setLogging] = useState(false);

  const today = todayKey();
  const start = profile.startWeightKg;
  const target = profile.targetWeightKg;
  const hasGoal = profile.goal !== 'maintain';
  const totalDelta = Math.abs(target - start);
  const done = hasGoal && totalDelta > 0 ? clamp(Math.abs(weight - start) / totalDelta, 0, 1) : 0;
  const movingRight = hasGoal ? (profile.goal === 'lose' ? weight <= start : weight >= start) : true;
  const pct = movingRight ? done : 0;
  const remaining = Math.abs(target - weight);
  const reached = hasGoal && (profile.goal === 'lose' ? weight <= target : weight >= target);
  const weeks = weeksToGoal(profile, weight);
  const eta = weeks && weeks > 0 ? addDays(today, Math.ceil(weeks * 7)) : null;
  const change = weight - start;

  const shown = range === 'all' ? weights : weights.filter((w) => daysBetween(w.date, today) <= Number(range));
  const points = shown.map((w) => ({ x: daysBetween(shown[0].date, w.date), y: w.kg, label: formatDate(w.date) }));

  // Cambio de los últimos 7 días: peso actual frente al registro más cercano a hace una semana.
  const weekAgo = [...weights].reverse().find((w) => daysBetween(w.date, today) >= 7);
  const weekChange = weekAgo ? weight - weekAgo.kg : null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = days.map((d) => sumEntries(entries.filter((e) => e.date === d)).kcal);
  const logged = perDay.filter((k) => k > 0);
  const avg = logged.length > 0 ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;

  let streak = 0;
  const loggedDays = new Set(entries.map((e) => e.date));
  for (let d = loggedDays.has(today) ? today : addDays(today, -1); loggedDays.has(d); d = addDays(d, -1)) streak++;

  const bmiNow = bmi(weight, profile.heightCm);

  return (
    <div className="screen with-tabs">
      <div className="row spread">
        <h1 className="title-xl">Progreso</h1>
        <button className="btn sm" onClick={() => setLogging(true)}>
          <Plus size={18} /> Registrar peso
        </button>
      </div>

      <div className="card col">
        <div className="row spread" style={{ alignItems: 'flex-end' }}>
          <div>
            <p className="small muted">Peso actual</p>
            <p className="num" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {fmt(weight, 1)} <span style={{ fontSize: 16, fontWeight: 600 }}>kg</span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="small muted">Desde el inicio</p>
            <p className="num" style={{ fontWeight: 700 }}>
              {change === 0 ? 'Sin cambios' : `${change > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(change), 1)} kg`}
            </p>
          </div>
        </div>
        {hasGoal ? (
          <>
            <div className="progress-track" role="progressbar" aria-label="Avance hacia el peso objetivo" aria-valuenow={Math.round(pct * 100)} aria-valuemax={100}>
              <div style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="row spread small">
              <span className="muted num">Inicio {fmt(start, 1)} kg</span>
              <strong className="num">{reached ? '¡Objetivo logrado!' : `Faltan ${fmt(remaining, 1)} kg`}</strong>
              <span className="muted num">Meta {fmt(target, 1)} kg</span>
            </div>
            {!reached && eta && (
              <p className="small muted">
                {GOALS[profile.goal].label} a {fmt(profile.weeklyRateKg, 2)} kg por semana: llegarías a tu meta cerca del <strong style={{ color: 'var(--text)' }}>{formatDate(eta, true)}</strong>.
              </p>
            )}
          </>
        ) : (
          <p className="small muted">Tu objetivo es mantener el peso. Registra tu peso una vez por semana para ver la tendencia.</p>
        )}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v num">{fmt(bmiNow, 1)}</div>
          <div className="l">IMC · {bmiLabel(bmiNow)}</div>
        </div>
        <div className="kpi">
          <div className="v num">{weekChange === null ? '—' : `${weekChange > 0 ? '+' : weekChange < 0 ? '−' : ''}${fmt(Math.abs(weekChange), 1)}`}</div>
          <div className="l">kg en 7 días</div>
        </div>
        <div className="kpi">
          <div className="v num">{streak}</div>
          <div className="l">{streak === 1 ? 'día seguido' : 'días seguidos'} registrando</div>
        </div>
      </div>

      <div className="card col">
        <div className="row spread">
          <h2 className="card-title">Evolución del peso</h2>
        </div>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '1 mes' },
            { value: '90', label: '3 meses' },
            { value: 'all', label: 'Todo' },
          ]}
        />
        {points.length >= 2 ? (
          <>
            <LineChart
              points={points}
              unit="kg"
              goal={hasGoal ? target : undefined}
              goalLabel={`Meta ${fmt(target, 1)} kg`}
              xLabels={[formatDate(shown[0].date), formatDate(shown[shown.length - 1].date)]}
            />
            <div className="legend">
              <span>
                <i /> Peso (kg)
              </span>
              {hasGoal && (
                <span>
                  <i className="dashed" /> Peso objetivo
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="empty">Registra tu peso al menos dos días distintos en este período para ver el gráfico.</p>
        )}
      </div>

      <div className="card col">
        <div className="row spread">
          <h2 className="card-title">Calorías, últimos 7 días</h2>
          <span className="small muted num">{avg > 0 ? `Promedio ${fmt(avg)}` : ''}</span>
        </div>
        <BarChart
          ariaLabel="Calorías consumidas por día en la última semana"
          goal={targets.kcal}
          data={days.map((d, i) => ({ label: weekdayShort(d), value: perDay[i], tip: `${formatDate(d)} · ${fmt(perDay[i])} kcal` }))}
        />
        <div className="legend">
          <span>
            <i className="dashed" /> Meta diaria ({fmt(targets.kcal)} kcal)
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Historial de peso</h2>
        {weights.length > 0 ? (
          <div className="list">
            {[...weights]
              .reverse()
              .slice(0, 12)
              .map((w) => (
                <div className="list-item" key={w.date}>
                  <div className="grow name">{formatDate(w.date, true)}</div>
                  <span className="kcal num">{fmt(w.kg, 1)} kg</span>
                  <button className="icon-btn" aria-label={`Eliminar registro del ${formatDate(w.date)}`} onClick={() => removeWeight(w.date)}>
                    <Trash2 size={18} color="var(--text-3)" />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="empty">Sin registros todavía.</p>
        )}
      </div>

      {logging && <WeightSheet current={weight} onClose={() => setLogging(false)} />}
    </div>
  );
}

function WeightSheet({ current, onClose }: { current: number; onClose: () => void }) {
  const logWeight = useStore((s) => s.logWeight);
  const showToast = useUi((s) => s.showToast);
  const [kg, setKg] = useState(fmt(current, 1));
  const [date, setDate] = useState(todayKey());
  const n = parseNum(kg);
  const valid = n !== null && n >= 30 && n <= 300 && date <= todayKey() && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Sheet title="Registrar peso" onClose={onClose}>
      <Field label="Peso" value={kg} onChange={setKg} suffix="kg" numeric autoFocus />
      <Field label="Fecha" value={date} onChange={setDate} type="date" />
      <p className="xs muted">Consejo: pésate siempre a la misma hora, idealmente al despertar, para que los datos sean comparables.</p>
      <button
        className="btn"
        disabled={!valid}
        onClick={() => {
          if (n === null) return;
          logWeight(date, Math.round(n * 10) / 10);
          showToast('Peso registrado');
          onClose();
        }}
      >
        Guardar
      </button>
    </Sheet>
  );
}

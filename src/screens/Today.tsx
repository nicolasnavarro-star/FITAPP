import { ChevronLeft, ChevronRight, Cookie, Droplet, Flame, Moon, Plus, Sun, Sunrise } from 'lucide-react';
import { Ring } from '../components/charts';
import { FoodThumb } from '../components/ui';
import { MEALS } from '../lib/meals';
import { macrosFor, sumEntries } from '../lib/nutrition';
import type { Entry, MealId } from '../lib/types';
import { addDays, clamp, fmt, friendlyDate, parseDateKey, todayKey, weekdayShort } from '../lib/util';
import { push } from '../router';
import { useStore, useTargets, useUi } from '../store';

const WATER_GOAL = 2000;
const GLASS = 250;

const MEAL_STYLE: Record<MealId, { icon: typeof Sun; tone: string; share: number }> = {
  breakfast: { icon: Sunrise, tone: '#f59f00', share: 0.25 },
  lunch: { icon: Sun, tone: '#12a56b', share: 0.35 },
  dinner: { icon: Moon, tone: '#5b6cf0', share: 0.3 },
  snack: { icon: Cookie, tone: '#e0559a', share: 0.1 },
};

function MacroTile({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="macro-tile">
      <div className="ring-wrap">
        <Ring value={value} target={target} size={58} stroke={7} color={color} overColor={color} label={`${label}: ${fmt(value)} de ${fmt(target)} gramos`} />
        <div className="ring-center xs num" style={{ fontWeight: 800 }}>
          {target > 0 ? Math.round(clamp(value / target, 0, 9.99) * 100) : 0}%
        </div>
      </div>
      <span className="v num">
        {fmt(value)}
        <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}> / {fmt(target)} g</span>
      </span>
      <span className="l">
        <span className="dot" style={{ background: color }} />
        {label}
      </span>
    </div>
  );
}

export default function Today() {
  const date = useUi((s) => s.date);
  const setDate = useUi((s) => s.setDate);
  const setDraft = useUi((s) => s.setDraft);
  const name = useStore((s) => s.profile?.name);
  const allEntries = useStore((s) => s.entries);
  const water = useStore((s) => s.water[date] ?? 0);
  const addWater = useStore((s) => s.addWater);
  const targets = useTargets();
  const today = todayKey();

  const entries = allEntries.filter((e) => e.date === date);
  const total = sumEntries(entries);
  const remaining = targets.kcal - total.kcal;
  const over = remaining < 0;

  // Semana (lunes a domingo) del día seleccionado, con las calorías de cada día.
  const weekStart = addDays(date, -((parseDateKey(date).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const kcalByDay = new Map<string, number>();
  for (const e of allEntries) kcalByDay.set(e.date, (kcalByDay.get(e.date) ?? 0) + macrosFor(e.food, e.grams).kcal);

  let streak = 0;
  for (let d = kcalByDay.has(today) ? today : addDays(today, -1); kcalByDay.has(d); d = addDays(d, -1)) streak++;

  const openEntry = (e: Entry) => {
    setDraft({ food: e.food, grams: e.grams, meal: e.meal, entryId: e.id });
    push('/food');
  };

  const glasses = Math.round(water / GLASS);

  return (
    <div className="screen with-tabs">
      <div className="row">
        <span className="avatar" aria-hidden>
          {(name || 'H').charAt(0).toUpperCase()}
        </span>
        <div className="grow">
          <p className="muted small">{name ? `Hola, ${name}` : 'Tu diario'}</p>
          <h1 className="title-xl" style={{ fontSize: 23 }}>
            {friendlyDate(date)}
          </h1>
        </div>
        {streak > 0 && (
          <span className="streak num" aria-label={`Racha de ${streak} ${streak === 1 ? 'día' : 'días'}`}>
            <Flame size={17} /> {streak}
          </span>
        )}
      </div>

      <div className="row" style={{ gap: 2 }}>
        <button className="icon-btn" style={{ width: 32 }} aria-label="Semana anterior" onClick={() => setDate(addDays(date, -7))}>
          <ChevronLeft size={20} />
        </button>
        <div className="week grow">
          {week.map((d) => {
            const kcal = kcalByDay.get(d) ?? 0;
            return (
              <button
                key={d}
                className={`day ${d === date ? 'selected' : ''} ${d === today ? 'today' : ''}`}
                disabled={d > today}
                aria-pressed={d === date}
                aria-label={`${friendlyDate(d)}: ${fmt(kcal)} kcal`}
                onClick={() => setDate(d)}
              >
                {weekdayShort(d).slice(0, 2)}
                <span className="ring-day">
                  <Ring value={kcal} target={targets.kcal} size={38} stroke={4} overColor="var(--carbs)" label="" />
                  <span className="num">{parseDateKey(d).getDate()}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          className="icon-btn"
          style={{ width: 32 }}
          aria-label="Semana siguiente"
          disabled={addDays(weekStart, 7) > today}
          onClick={() => setDate(addDays(date, 7) > today ? today : addDays(date, 7))}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="hero col" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 18 }}>
          <div className="ring-wrap">
            <Ring
              value={total.kcal}
              target={targets.kcal}
              size={148}
              stroke={13}
              color="#ffffff"
              overColor="#ffb3a7"
              track="rgba(255,255,255,0.18)"
              label={`${fmt(total.kcal)} de ${fmt(targets.kcal)} kcal`}
            />
            <div className="ring-center">
              <span className="big num">{fmt(Math.abs(remaining))}</span>
              <span className="label" style={{ fontSize: 11 }}>
                {over ? 'kcal de más' : 'kcal restantes'}
              </span>
            </div>
          </div>
          <div className="col grow" style={{ gap: 10 }}>
            <div className="hero-stat">
              <b className="num">{fmt(total.kcal)}</b>
              <span>Consumidas</span>
            </div>
            <div className="hero-stat">
              <b className="num">{fmt(targets.kcal)}</b>
              <span>Meta diaria</span>
            </div>
          </div>
        </div>
      </div>

      <div className="macro-tiles">
        <MacroTile label="Proteínas" value={total.protein} target={targets.protein} color="var(--protein)" />
        <MacroTile label="Carbos" value={total.carbs} target={targets.carbs} color="var(--carbs)" />
        <MacroTile label="Grasas" value={total.fat} target={targets.fat} color="var(--fat)" />
      </div>

      <h2 className="section-title">Comidas</h2>
      {MEALS.map((meal) => {
        const items = entries.filter((e) => e.meal === meal.id);
        const kcal = sumEntries(items).kcal;
        const { icon: Icon, tone, share } = MEAL_STYLE[meal.id];
        const suggested = Math.round((targets.kcal * share) / 10) * 10;
        return (
          <div className="card" key={meal.id}>
            <div className="row">
              <span className="meal-icon" style={{ ['--tone' as string]: tone }}>
                <Icon size={22} />
              </span>
              <div className="grow">
                <h3 className="card-title">{meal.label}</h3>
                <p className="small muted num">
                  {fmt(kcal)} de {fmt(suggested)} kcal sugeridas
                </p>
              </div>
              <button className="icon-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} aria-label={`Agregar a ${meal.label}`} onClick={() => push(`/add?meal=${meal.id}`)}>
                <Plus size={22} />
              </button>
            </div>
            {items.length > 0 && (
              <div className="list" style={{ marginTop: 8 }}>
                {items.map((e) => {
                  const m = macrosFor(e.food, e.grams);
                  return (
                    <button key={e.id} className="list-item" onClick={() => openEntry(e)}>
                      <FoodThumb name={e.food.name} image={e.food.image} />
                      <div className="grow">
                        <div className="name">{e.food.name}</div>
                        <div className="sub num">
                          {e.food.source === 'quick'
                            ? e.food.name === 'Añadido rápido'
                              ? 'Solo calorías'
                              : 'Añadido rápido'
                            : `${fmt(e.grams)} ${e.food.unit} · P ${fmt(m.protein)} · C ${fmt(m.carbs)} · G ${fmt(m.fat)}`}
                        </div>
                      </div>
                      <span className="kcal num">
                        {fmt(m.kcal)}
                        <small>kcal</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="card col">
        <div className="row">
          <span className="meal-icon" style={{ ['--tone' as string]: 'var(--protein)' }}>
            <Droplet size={22} />
          </span>
          <div className="grow">
            <h3 className="card-title">Agua</h3>
            <p className="small muted num">
              {fmt(water)} de {fmt(WATER_GOAL)} ml
            </p>
          </div>
        </div>
        <div className="glasses">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              className={`glass ${i < glasses ? 'full' : ''}`}
              aria-label={i < glasses ? `Quitar agua hasta ${i} vasos` : `Registrar ${i + 1} vasos de agua`}
              onClick={() => addWater(date, (i < glasses ? i : i + 1) * GLASS - water)}
            >
              <Droplet size={18} fill={i < glasses ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

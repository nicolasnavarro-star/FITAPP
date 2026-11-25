import { Camera, ChevronLeft, ChevronRight, Droplet, Minus, Plus, ScanBarcode, Search } from 'lucide-react';
import { MacroMeter, Ring } from '../components/charts';
import { MEALS } from '../lib/meals';
import { macrosFor, sumEntries } from '../lib/nutrition';
import type { Entry } from '../lib/types';
import { addDays, fmt, friendlyDate, todayKey } from '../lib/util';
import { push } from '../router';
import { useStore, useTargets, useUi } from '../store';

const WATER_GOAL = 2000;
const GLASS = 250;

export default function Today() {
  const date = useUi((s) => s.date);
  const setDate = useUi((s) => s.setDate);
  const setDraft = useUi((s) => s.setDraft);
  const name = useStore((s) => s.profile?.name);
  const allEntries = useStore((s) => s.entries);
  const water = useStore((s) => s.water[date] ?? 0);
  const addWater = useStore((s) => s.addWater);
  const targets = useTargets();

  const entries = allEntries.filter((e) => e.date === date);
  const total = sumEntries(entries);
  const remaining = targets.kcal - total.kcal;
  const over = remaining < 0;

  const openEntry = (e: Entry) => {
    setDraft({ food: e.food, grams: e.grams, meal: e.meal, entryId: e.id });
    push('/food');
  };

  return (
    <div className="screen with-tabs">
      <div className="row spread">
        <div className="grow">
          <p className="muted small">{name ? `Hola, ${name}` : 'Tu diario'}</p>
          <h1 className="title-xl">{friendlyDate(date)}</h1>
        </div>
        <button className="icon-btn filled" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={22} />
        </button>
        <button className="icon-btn filled" aria-label="Día siguiente" disabled={date >= todayKey()} style={{ opacity: date >= todayKey() ? 0.35 : 1 }} onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="card col" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 16 }}>
          <div className="ring-wrap">
            <Ring value={total.kcal} target={targets.kcal} />
            <div className="ring-center">
              <span className="big num">{fmt(Math.abs(remaining))}</span>
              <span className="small muted">{over ? 'kcal de más' : 'kcal restantes'}</span>
            </div>
          </div>
          <div className="col grow" style={{ gap: 14 }}>
            <div className="stat">
              <span className="v num">{fmt(total.kcal)}</span>
              <span className="l">Consumidas</span>
            </div>
            <div className="stat">
              <span className="v num">{fmt(targets.kcal)}</span>
              <span className="l">Meta diaria</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <MacroMeter label="Proteínas" value={total.protein} target={targets.protein} color="var(--protein)" />
          <MacroMeter label="Carbos" value={total.carbs} target={targets.carbs} color="var(--carbs)" />
          <MacroMeter label="Grasas" value={total.fat} target={targets.fat} color="var(--fat)" />
        </div>
      </div>

      <div className="quick-actions">
        <button className="quick-action" onClick={() => push('/add')}>
          <Search size={24} />
          Buscar
        </button>
        <button className="quick-action" onClick={() => push('/scan')}>
          <ScanBarcode size={24} />
          Escanear
        </button>
        <button className="quick-action" onClick={() => push('/photo')}>
          <Camera size={24} />
          Foto con IA
        </button>
      </div>

      {MEALS.map((meal) => {
        const items = entries.filter((e) => e.meal === meal.id);
        const kcal = sumEntries(items).kcal;
        return (
          <div className="card" key={meal.id}>
            <div className="row spread">
              <div>
                <h2 className="card-title">{meal.label}</h2>
                <p className="small muted num">{items.length > 0 ? `${fmt(kcal)} kcal` : 'Sin registros'}</p>
              </div>
              <button className="icon-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} aria-label={`Agregar a ${meal.label}`} onClick={() => push(`/add?meal=${meal.id}`)}>
                <Plus size={22} />
              </button>
            </div>
            {items.length > 0 && (
              <div className="list" style={{ marginTop: 6 }}>
                {items.map((e) => (
                  <button key={e.id} className="list-item" onClick={() => openEntry(e)}>
                    <div className="grow">
                      <div className="name">{e.food.name}</div>
                      <div className="sub">{e.food.source === 'quick' ? (e.food.name === 'Añadido rápido' ? 'Solo calorías' : 'Añadido rápido') : `${fmt(e.grams)} ${e.food.unit}${e.food.brand ? ` · ${e.food.brand}` : ''}`}</div>
                    </div>
                    <span className="kcal num">{fmt(macrosFor(e.food, e.grams).kcal)} kcal</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="card row">
        <span className="badge" style={{ color: 'var(--protein)', background: 'color-mix(in srgb, var(--protein) 14%, transparent)' }}>
          <Droplet size={20} />
        </span>
        <div className="grow">
          <h2 className="card-title">Agua</h2>
          <p className="small muted num">
            {fmt(water)} / {fmt(WATER_GOAL)} ml
          </p>
        </div>
        <button className="icon-btn" style={{ background: 'var(--surface-2)' }} aria-label="Quitar un vaso" disabled={water <= 0} onClick={() => addWater(date, -GLASS)}>
          <Minus size={20} />
        </button>
        <button className="icon-btn" style={{ background: 'var(--surface-2)' }} aria-label="Agregar un vaso de agua" onClick={() => addWater(date, GLASS)}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

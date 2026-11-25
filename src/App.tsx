import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Camera, Dumbbell, Mountain as MountainIcon, Plus, ScanBarcode, Search, TrendingUp, User, Utensils, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet, Toast } from './components/ui';
import { MEALS, defaultMeal } from './lib/meals';
import { restoreRecording } from './lib/recorder';
import type { MealId } from './lib/types';
import { friendlyDate } from './lib/util';
import { canGoBack, push, replace, useRoute } from './router';
import ActivityDetail from './screens/ActivityDetail';
import AddFood from './screens/AddFood';
import AiSettings from './screens/AiSettings';
import CustomFood from './screens/CustomFood';
import Equipment from './screens/Equipment';
import Mountain from './screens/Mountain';
import FoodDetail from './screens/FoodDetail';
import Onboarding from './screens/Onboarding';
import PhotoAI from './screens/PhotoAI';
import PlanSetup from './screens/PlanSetup';
import Profile from './screens/Profile';
import Progress from './screens/Progress';
import Record from './screens/Record';
import RouteDetail from './screens/RouteDetail';
import RoutePlan from './screens/RoutePlan';
import Scanner from './screens/Scanner';
import TargetsScreen from './screens/Targets';
import Today from './screens/Today';
import Train from './screens/Train';
import Workout from './screens/Workout';
import { useStore, useUi } from './store';

const TABS = [
  { path: '/', label: 'Diario', icon: Utensils },
  { path: '/progress', label: 'Progreso', icon: TrendingUp },
  { path: '/train', label: 'Entreno', icon: Dumbbell },
  { path: '/mountain', label: 'Montaña', icon: MountainIcon },
  { path: '/profile', label: 'Perfil', icon: User },
];

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    if (Capacitor.isNativePlatform()) {
      // Los iconos de la barra de estado deben contrastar con el tema elegido en la app.
      const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
      void SystemBars.setStyle({ style }).catch(() => undefined);
    }
  }, [theme]);
}

function useAndroidBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapApp.addListener('backButton', () => {
      if (canGoBack()) window.history.back();
      else void CapApp.minimizeApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}

const ADD_ACTIONS = [
  { path: '/add', icon: Search, title: 'Buscar', desc: 'Alimentos, productos o búsqueda con IA', extra: '' },
  { path: '/scan', icon: ScanBarcode, title: 'Escanear', desc: 'Código de barras del envase', extra: '' },
  { path: '/photo', icon: Camera, title: 'Foto con IA', desc: 'Reconoce lo que hay en tu plato', extra: '' },
  { path: '/add', icon: Zap, title: 'Rápido', desc: 'Anota solo las calorías', extra: '&quick=1' },
];

/** Hoja del botón central: elige la comida y la forma de registrarla. */
function AddSheet({ onClose }: { onClose: () => void }) {
  const date = useUi((s) => s.date);
  const [meal, setMeal] = useState<MealId>(defaultMeal());
  return (
    <Sheet title="Registrar comida" onClose={onClose}>
      <p className="small muted" style={{ marginTop: -8 }}>
        Se agregará al diario de {friendlyDate(date).toLowerCase()}.
      </p>
      <div className="chips" role="group" aria-label="Comida">
        {MEALS.map((m) => (
          <button key={m.id} className={`chip ${meal === m.id ? 'active' : ''}`} aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="action-grid">
        {ADD_ACTIONS.map(({ path, icon: Icon, title, desc, extra }) => (
          <button
            key={title}
            className="action"
            onClick={() => {
              onClose();
              push(`${path}?meal=${meal}${extra}`);
            }}
          >
            <span className="badge">
              <Icon size={20} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{desc}</span>
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function Screen({ path }: { path: string }) {
  switch (path) {
    case '/':
      return <Today />;
    case '/progress':
      return <Progress />;
    case '/train':
      return <Train />;
    case '/profile':
      return <Profile />;
    case '/mountain':
      return <Mountain />;
    case '/record':
      return <Record />;
    case '/activity':
      return <ActivityDetail />;
    case '/route-plan':
      return <RoutePlan />;
    case '/route':
      return <RouteDetail />;
    case '/add':
      return <AddFood />;
    case '/food':
      return <FoodDetail />;
    case '/scan':
      return <Scanner />;
    case '/photo':
      return <PhotoAI />;
    case '/custom-food':
      return <CustomFood />;
    case '/plan-setup':
      return <PlanSetup />;
    case '/equipment':
      return <Equipment />;
    case '/workout':
      return <Workout />;
    case '/edit-profile':
      return <Onboarding editing />;
    case '/targets':
      return <TargetsScreen />;
    case '/ai':
      return <AiSettings />;
    default:
      return <Today />;
  }
}

export default function App() {
  useTheme();
  useAndroidBackButton();
  useEffect(() => {
    // Si Android cerró la app en plena salida, la grabación se recupera en pausa.
    void restoreRecording().then((found) => found && useUi.getState().showToast('Se retomó tu actividad en curso. Está en Montaña.'));
  }, []);
  const route = useRoute();
  const hasProfile = useStore((s) => s.profile !== null);
  const [adding, setAdding] = useState(false);

  if (!hasProfile) {
    return (
      <div className="app">
        <Onboarding />
        <Toast />
      </div>
    );
  }

  const isTab = TABS.some((t) => t.path === route.path);
  return (
    <div className="app">
      <Screen path={route.path} />
      {isTab && (
        <nav className="tabbar">
          {TABS.map(({ path, label, icon: Icon }) => (
            <button key={path} className={`tab ${route.path === path ? 'active' : ''}`} aria-current={route.path === path} onClick={() => replace(path)}>
              <Icon size={22} />
              {label}
            </button>
          ))}
        </nav>
      )}
      {route.path === '/' && (
        <button className="fab" aria-label="Registrar comida" onClick={() => setAdding(true)}>
          <Plus size={28} />
        </button>
      )}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
      <Toast />
    </div>
  );
}

import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Dumbbell, TrendingUp, User, Utensils } from 'lucide-react';
import { useEffect } from 'react';
import { Toast } from './components/ui';
import { canGoBack, replace, useRoute } from './router';
import AddFood from './screens/AddFood';
import AiSettings from './screens/AiSettings';
import CustomFood from './screens/CustomFood';
import FoodDetail from './screens/FoodDetail';
import Onboarding from './screens/Onboarding';
import PhotoAI from './screens/PhotoAI';
import PlanSetup from './screens/PlanSetup';
import Profile from './screens/Profile';
import Progress from './screens/Progress';
import Scanner from './screens/Scanner';
import TargetsScreen from './screens/Targets';
import Today from './screens/Today';
import Train from './screens/Train';
import Workout from './screens/Workout';
import { useStore } from './store';

const TABS = [
  { path: '/', label: 'Diario', icon: Utensils },
  { path: '/progress', label: 'Progreso', icon: TrendingUp },
  { path: '/train', label: 'Entreno', icon: Dumbbell },
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
  const route = useRoute();
  const hasProfile = useStore((s) => s.profile !== null);

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
      <Toast />
    </div>
  );
}

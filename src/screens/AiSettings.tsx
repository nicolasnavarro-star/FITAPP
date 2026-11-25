import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Header, Segmented } from '../components/ui';
import { AiError, CLAUDE_MODELS, testAi } from '../lib/ai';
import type { AiProvider } from '../lib/types';
import { useStore } from '../store';

export default function AiSettings() {
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });

  const isGemini = ai.provider === 'gemini';
  const key = isGemini ? ai.geminiKey : ai.claudeKey;
  const setKey = (v: string) => {
    setStatus({ kind: 'idle' });
    setAi(isGemini ? { geminiKey: v.trim() } : { claudeKey: v.trim() });
  };

  const test = async () => {
    setStatus({ kind: 'testing' });
    try {
      const model = await testAi(ai);
      if (isGemini) setAi({ geminiModel: model });
      setStatus({ kind: 'ok', msg: `Conexión correcta. Modelo: ${model}` });
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AiError ? e.message : 'No se pudo verificar la clave.' });
    }
  };

  return (
    <div className="screen">
      <Header title="Inteligencia artificial" />
      <p className="small muted">
        La foto con IA identifica los alimentos de tu plato y estima calorías y macros. Para eso la app se conecta a un servicio de IA con una clave personal tuya.
      </p>

      <Segmented<AiProvider>
        value={ai.provider}
        onChange={(provider) => {
          setStatus({ kind: 'idle' });
          setAi({ provider });
        }}
        options={[
          { value: 'gemini', label: 'Google Gemini (gratis)' },
          { value: 'claude', label: 'Claude (de pago)' },
        ]}
      />

      <div className="card col small">
        {isGemini ? (
          <>
            <h2 className="card-title">Cómo obtener tu clave gratuita</h2>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                Entra a{' '}
                <a className="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>{' '}
                con tu cuenta de Google.
              </li>
              <li>Toca «Crear clave de API» y cópiala.</li>
              <li>Pégala aquí abajo y toca «Probar conexión».</li>
            </ol>
            <p className="muted xs">El nivel gratuito de Gemini tiene un límite diario de solicitudes, suficiente para uso personal.</p>
          </>
        ) : (
          <>
            <h2 className="card-title">Clave de la API de Anthropic</h2>
            <p>
              Crea una clave en{' '}
              <a className="link" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
                platform.claude.com
              </a>
              . Este servicio se cobra por uso: cada foto analizada cuesta una fracción de centavo de dólar a unos pocos centavos, según el modelo.
            </p>
          </>
        )}
      </div>

      <label className="field">
        <span>Clave de API</span>
        <div className="input-wrap">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={isGemini ? 'AIza…' : 'sk-ant-…'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Clave de API"
          />
          <button aria-label={show ? 'Ocultar clave' : 'Mostrar clave'} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={20} color="var(--text-3)" /> : <Eye size={20} color="var(--text-3)" />}
          </button>
        </div>
      </label>

      {!isGemini && (
        <label className="field">
          <span>Modelo</span>
          <div className="input-wrap">
            <select value={ai.claudeModel} onChange={(e) => setAi({ claudeModel: e.target.value })} aria-label="Modelo de Claude">
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </label>
      )}

      <button className="btn" disabled={key.length < 10 || status.kind === 'testing'} onClick={() => void test()}>
        {status.kind === 'testing' ? 'Probando…' : 'Probar conexión'}
      </button>

      {status.kind === 'ok' && (
        <div className="notice row" role="status">
          <CheckCircle2 size={20} color="var(--good-text)" />
          <span className="grow">{status.msg}</span>
        </div>
      )}
      {status.kind === 'error' && (
        <div className="notice error" role="alert">
          {status.msg}
        </div>
      )}

      <p className="xs muted">
        Privacidad: la clave se guarda solo en este teléfono y no se incluye en los respaldos. Las fotos se envían directamente desde tu teléfono al proveedor elegido
        únicamente cuando tocas «Analizar con IA».
      </p>
    </div>
  );
}

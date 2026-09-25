import FinexyLayout from '../../components/FinexyLayout'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

// Gestión de finanzas: el capital completo, lo que se generó cada día, la suma
// de los días y el año.
//
// Está vacía a propósito. Lo único que hay hecho es la puerta: la entrada
// desde el panel y la dirección propia, separada del resto para que lo que se
// construya aquí no acabe mezclado con la operación del día a día.
//
// AVISO, mientras esto siga así: hoy la única llave es ser super-admin. La
// clave aparte —distinta a la de la sesión— todavía no existe, ni por delante
// ni por detrás, así que cualquiera con una sesión de super-admin abierta
// entra. No se puso un candado de mentira a la espera del de verdad: un campo
// de contraseña que el servidor no comprueba aparenta una protección que no
// hay, y se acaba confiando en ella.
export default function Finanzas() {
  return (
    <FinexyLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#eaf2ff' }}>
            Gestión de finanzas
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8aa0cc' }}>
            Capital completo, lo generado cada día y el acumulado del año.
          </p>
        </div>

        <div className="p-6 md:p-8 text-center" style={GLASS}>
          <div className="mx-auto mb-4 flex items-center justify-center"
            style={{
              width: 52, height: 52, borderRadius: 16,
              background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)',
            }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>

          <p className="text-base font-semibold" style={{ color: '#eaf2ff' }}>
            Todavía no hay nada aquí
          </p>
          <p className="text-sm mt-2 max-w-md mx-auto leading-relaxed" style={{ color: '#8aa0cc' }}>
            La sección está creada y solo se ve desde tu cuenta de super-admin.
            El siguiente paso es la clave aparte para entrar, y después el
            conteo diario y anual.
          </p>

          <p className="text-xs mt-5 max-w-md mx-auto leading-relaxed" style={{ color: '#fcd34d' }}>
            Ojo: por ahora entra cualquiera que tenga una sesión de super-admin
            abierta. La clave propia aún no está puesta.
          </p>
        </div>
      </div>
    </FinexyLayout>
  )
}

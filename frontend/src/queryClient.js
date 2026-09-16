import { QueryClient } from '@tanstack/react-query'

// Cada cuánto se vuelve a preguntar al servidor mientras una pantalla está
// abierta. Sin esto, lo que se veía era una foto del momento en que se cargó:
// un cliente subía su comprobante y el admin no se enteraba hasta recargar.
//
// 15 segundos es un término medio: se nota como tiempo real sin castigar al
// servidor. Las pantallas que consultan servicios externos y tardan —Koywe,
// Binance— ponen su propio intervalo, más largo, en su useQuery.
const REFRESCO_MS = 15000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Corto: lo que importa es no pedir dos veces lo mismo en la misma
      // pantallada, no guardar datos viejos medio minuto.
      staleTime: 5000,

      refetchInterval: REFRESCO_MS,
      // Solo con la pestaña delante. En segundo plano no hay nadie mirando, y
      // un panel abierto toda la noche seguiría pidiendo cada 15 segundos.
      refetchIntervalInBackground: false,

      // Al volver a la pestaña o al recuperar la conexión, refrescar sin
      // esperar al siguiente ciclo.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,

      // Dos reintentos con espera creciente. Con uno solo, un reinicio de la
      // API —cada despliegue lo provoca— dejaba la pantalla en blanco y había
      // que recargar a mano; era justo el síntoma de "a veces no carga".
      retry: 2,
      retryDelay: (intento) => Math.min(1000 * 2 ** intento, 8000),
    },
  },
})

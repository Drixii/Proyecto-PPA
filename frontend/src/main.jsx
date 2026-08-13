import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import './index.css'
import App from './App.jsx'

// Recargar cuando el service worker nuevo toma el control.
//
// Sin esto, un despliegue tardaba una carga extra en aplicarse: el service
// worker sirve la app que tiene precacheada, se entera del cambio mientras
// tanto, y el código nuevo entra recién la próxima vez que se abre la página.
// Con el navegador diciendo "ya está actualizado" pero corriendo la versión
// vieja, el efecto es peor que un caché normal — cuesta darse cuenta.
if ('serviceWorker' in navigator) {
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return   // controllerchange puede dispararse dos veces
    recargando = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

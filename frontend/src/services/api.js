import axios from 'axios'
import { queryClient } from '../queryClient'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      queryClient.clear()
      const publicPaths = ['/', '/login', '/register']
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/'
      }
    }
    return Promise.reject(err)
  }
)

export default api

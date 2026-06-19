# Ksa Global — Export React

## Archivos incluidos
- `Home.jsx` → reemplaza `PPA/frontend/src/pages/Home.jsx`
- `Login.jsx` → reemplaza `PPA/frontend/src/pages/Auth/Login.jsx`
- `logo.png` → copiar a `PPA/frontend/src/assets/logo.png`

## Pasos de instalación

### 1. Copiar el logo
```
cp logo.png ../PPA/frontend/src/assets/logo.png
```

### 2. Reemplazar Home.jsx
```
cp Home.jsx ../PPA/frontend/src/pages/Home.jsx
```

### 3. Reemplazar Login.jsx
```
cp Login.jsx ../PPA/frontend/src/pages/Auth/Login.jsx
```

### 4. Nota sobre Calculator
`Home.jsx` usa el componente `Calculator` existente. El convertidor del banner
llama a `<Calculator onSend={handleSend} darkMode />`. Si quieres el glass 
oscuro en el Calculator, agrega la prop `darkMode` y ajusta los estilos internos
de `Calculator.jsx`, o usa el Calculator tal cual (funciona sin esa prop).

### 5. Dependencias
No hay nuevas dependencias. Todo usa lo que ya tienes:
- react-router-dom
- @tanstack/react-query  
- axios (api.js)
- useStore (zustand)

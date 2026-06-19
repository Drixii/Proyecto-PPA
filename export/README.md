# Ksa Global — Export React

## Archivos incluidos
- `Home.jsx`          → reemplaza `src/pages/Home.jsx`
- `CalculatorDark.jsx`→ agregar como `src/components/CalculatorDark.jsx`
- `Login.jsx`         → reemplaza `src/pages/Auth/Login.jsx`
- `logo.png`          → copiar a `src/assets/logo.png`

## Pasos de instalación

### 1. Copiar logo
```
cp logo.png  PPA/frontend/src/assets/logo.png
```

### 2. Agregar CalculatorDark (NUEVO — obligatorio)
```
cp CalculatorDark.jsx  PPA/frontend/src/components/CalculatorDark.jsx
```
Este componente mantiene toda la lógica real de tu API:
- GET /rates/countries
- GET /rates/convert
- Auto-refresh cada 60s
- Animación count-up en el resultado

### 3. Reemplazar Home.jsx
```
cp Home.jsx  PPA/frontend/src/pages/Home.jsx
```

### 4. Reemplazar Login.jsx
```
cp Login.jsx  PPA/frontend/src/pages/Auth/Login.jsx
```

## Dependencias (ya las tienes)
- react-router-dom
- @tanstack/react-query
- axios
- zustand (useStore)

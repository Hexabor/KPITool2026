# KPI Tool 2026

Herramienta de analisis de KPIs de tienda y grupo, alimentada con datos CSV de operaciones (Looker u otras fuentes).

## Funcionalidades

- **Importacion CSV**: Carga archivos CSV grandes con miles de operaciones (ventas, compras, transfers, RMA)
- **Almacenamiento persistente**: IndexedDB local via Dexie.js, eficiente para grandes volumenes
- **KPIs configurados**: Motor de indicadores extensible (ventas por categoria, staff, tienda, semana...)
- **Dashboard**: Resumen visual de metricas clave
- **Explorador de datos**: Busqueda, filtrado y paginacion sobre los registros
- **Backup en Google Drive**: Sincronizacion de la base de datos con Drive
- **GitHub Pages**: Desplegable como pagina estatica

## Uso local

1. Abrir el proyecto en VS Code
2. Click derecho en `index.html` > "Open with Live Server"
3. Importar un CSV desde la seccion "Importar CSV"

## Estructura

```
index.html              # Pagina principal
css/styles.css          # Estilos
js/app.js               # Controlador principal
js/modules/
  database.js           # IndexedDB (Dexie.js)
  csv-parser.js         # Parser CSV (Papa Parse)
  kpi-engine.js         # Motor de KPIs
  drive-sync.js         # Sincronizacion Google Drive
  ui.js                 # Renderizado UI
```

## GitHub Pages

El proyecto esta preparado para desplegarse directamente desde la rama `main` en GitHub Pages (Settings > Pages > Source: main, folder: / root).

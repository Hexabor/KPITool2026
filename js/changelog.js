/**
 * Changelog - Diario de novedades.
 * Siempre lo mas nuevo arriba.
 */
const Changelog = [
    {
        date: '08/04/2026',
        items: [
            { type: 'new', text: 'Estructura base del proyecto: HTML/CSS/JS, IndexedDB (Dexie.js), Papa Parse' },
            { type: 'new', text: 'Home profesional con sidebar, topbar, panel resumen con filtros de periodo y tienda' },
            { type: 'new', text: 'Importador CSV adaptado al formato Baby Banking ES de Looker (12 columnas)' },
            { type: 'new', text: 'Multi-source: botones para Baby Banking, Ecom Sales, Attachment, Captacion (3 ultimos proximamente)' },
            { type: 'new', text: 'Historial de importaciones con metadata: archivo, origen, fecha, rango de datos, tiendas, filas' },
            { type: 'new', text: 'Deduplicacion por fuente al importar (misma orden de distinta fuente NO es duplicado)' },
            { type: 'new', text: 'Optimizacion de almacenamiento: solo campos KPI-relevantes, descarte de transfers y refunds' },
            { type: 'new', text: 'Backup comprimido .json.gz (pako.js). Importacion soporta .gz y .json' },
            { type: 'new', text: 'Nombre de exports con fecha y hora: kpitool_export_2026-04-08_1109.json.gz' },
            { type: 'new', text: 'Restablecer herramienta con doble confirmacion y recomendacion de backup previo' },
            { type: 'new', text: 'Calendario de negocio: semanas sabado-viernes, semana 1 = 27/12/2025, configurable' },
            { type: 'new', text: 'KPI Moviles: seccion dedicada con resumen por empleado/global y evolucion semanal' },
            { type: 'new', text: 'Resumen Moviles: 8 columnas sortables (moviles, total, services, %gel, basics, %basics, %combo)' },
            { type: 'new', text: 'Porcentajes con desglose de unidades (ej: "33% 4/12") y colores: >40% verde, 30-40% amarillo, <30% rojo' },
            { type: 'new', text: 'Selector de vista global/por empleado y selector de semana individual' },
            { type: 'new', text: 'Evolucion semanal: rango de semanas, metrica seleccionable, scope staff/total, columnas sortables' },
            { type: 'new', text: '% Combo: indicador de venta conjunta de geles + basics por movil' },
            { type: 'fix', text: 'Calculo de semanas con Date.UTC para evitar desfase por cambio de hora (DST)' },
            { type: 'fix', text: 'Fechas siempre en DD/MM/AAAA, input de texto en vez de date picker nativo' },
            { type: 'fix', text: 'Botones de confirmar/cancelar importacion visibles arriba sin necesidad de scroll' },
            { type: 'new', text: 'Google Drive sombreado como "proximamente"' },
            { type: 'new', text: 'Explorador de datos con busqueda, filtro por tipo y paginacion' },
        ]
    }
];

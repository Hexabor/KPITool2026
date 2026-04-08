# KPI Tool 2026 - Normas de desarrollo

## Formato de fechas
- Todos los campos de fecha visibles al usuario deben mostrarse en formato **DD/MM/AAAA**
- Los selectores de fecha (date pickers) deben mostrar las semanas empezando en **lunes**
- Internamente se puede usar ISO (YYYY-MM-DD) para almacenamiento y queries

## Calendario de negocio
- Las semanas van de **sabado a viernes**
- La **semana 1** del curso actual empieza el **27/12/2025** (sabado)
- Este valor es configurable en Ajustes pero ese es el default fijo

## Tipos de transaccion
- Sale, Cash Buy, Transfer, Exchange, Refund, RMA
- Cash Buy = compra a cliente (precio negativo)
- Transfer con SKU "TXORD" = orden de transferencia interna, no producto fisico

## Campos almacenados (solo KPI-relevantes)
- Se guardan: reference, type, category, date, store, staff, quantity, price, total, source, week
- Se descartan al importar: product, serial, sku, till, _raw
- Se descartan filas de tipo: transfer, refund (no aportan a KPIs)
- Backups comprimidos con gzip (pako.js): exporta .json.gz, importa .gz o .json

## Deduplicacion
- La deduplicacion es **por fuente (source)**. Un mismo Order Number puede aparecer en Baby Banking y en Ecom Sales y NO es duplicado
- Esto es intencionado: las coincidencias entre fuentes indican ordenes de e-commerce dentro de baby banking

## Datos CSV
- Origen: Looker (CeX)
- Columnas: Branch, Order Number, Staff, Order Dt, Transaction Type, Box ID, Box Name, SerialNo, Category, Till No, Quantity, Price
- Formato de fecha en CSV: "3 Apr 2026, 21:54:58"

## Estilo visual
- Iconos siempre **minimalistas y monocromo** (SVG stroke, lineas finas). Nunca emojis coloridos ni iconos juguetones
- Cuando se necesite un icono para un boton o card, usar SVG inline con stroke="currentColor"

## Terminologia
- NO usar la palabra "ajustes" en la UI (es un KPI interno de CeX). Usar "configuracion" en su lugar

## Stack
- Frontend puro (HTML/CSS/JS), compatible con GitHub Pages
- IndexedDB via Dexie.js para persistencia
- Papa Parse para CSV streaming
- Sin backend

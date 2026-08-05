# Portal BTL YAAVS 2026

Portal público para **consultar y descargar** solicitudes BTL en vivo (misma data que Zite).

## Funciones

- Listado en vivo con filtros (búsqueda, estado, flujo, fechas)
- Resumen: total, con foto, por flujo
- Vista grid / lista + orden
- **Descargar Excel (CSV)** de todas las filtradas
- JSON del lote, TXT/CSV por solicitud, fotos
- Auto-actualización cada 60s
- Listo para Hostinger (paths relativos + `.htaccess`)

## Desarrollo local

```bash
npm install
npm run dev
```

## Build para Hostinger

```bash
npm install
npm run build
```

Sube **todo el contenido** de la carpeta `dist/` a `public_html` (o la carpeta de tu dominio) en Hostinger File Manager.

También puedes usar el zip `hostinger-upload.zip` del repo (si está en Releases / raíz).

### Pasos Hostinger (resumen)

1. Entra a **hPanel → File Manager**
2. Abre `public_html` (o la carpeta de tu subdominio)
3. Sube los archivos de `dist/` (index.html, assets/, logo, .htaccess)
4. Abre tu dominio en el navegador

Si lo pones en una **subcarpeta** (ej. `public_html/portal-btl/`), el build con `base: './'` ya está preparado.

## Stack

- React + Vite + TypeScript
- API pública Zite: workflow `getSolicitudes` (`sy3akaxkpf`)

import { type GeoRecord } from '../screens/CapturaScreen';

// ── Datos necesarios para renderizar una tarjeta ──────────────────────────────
export type RecordCardData = {
  record: GeoRecord;
  photoB64: string | null;
  index: number;
  total: number;
};

// ── HTML de una sola tarjeta de registro ──────────────────────────────────────
export function buildRecordCardHTML({ record: r, photoB64, index, total }: RecordCardData): string {
  const photoHtml = photoB64
    ? `<img class="photo" src="data:image/jpeg;base64,${photoB64}" />`
    : `<div class="photo-placeholder">Sin fotografía</div>`;

  const dims =
    r.dimWidth || r.dimHeight
      ? [r.dimWidth, r.dimHeight].filter(Boolean).join(' × ') +
        (r.area ? ` (${r.area} m²)` : '')
      : '';

  // La URL de Google Maps va como última fila de la tabla
  const dataRows = [
    `<div class="dr"><span class="dl">Latitud</span><span class="dv coord">${r.coordinates.latitude.toFixed(6)}</span></div>`,
    `<div class="dr"><span class="dl">Longitud</span><span class="dv coord">${r.coordinates.longitude.toFixed(6)}</span></div>`,
    `<div class="dr"><span class="dl">Cuenta</span><span class="dv">${r.cuenta || '—'}</span></div>`,
    `<div class="dr"><span class="dl">ID Estructura</span><span class="dv">${r.fieldId || '—'}</span></div>`,
    `<div class="dr"><span class="dl">Propietario</span><span class="dv">${r.propietario || '—'}</span></div>`,
    r.structureType ? `<div class="dr"><span class="dl">Estructura</span><span class="dv">${r.structureType}</span></div>` : '',
    r.technology    ? `<div class="dr"><span class="dl">Tecnología</span><span class="dv">${r.technology}</span></div>`    : '',
    r.faces         ? `<div class="dr"><span class="dl">Caras</span><span class="dv">${r.faces}</span></div>`              : '',
    r.status        ? `<div class="dr"><span class="dl">Estatus</span><span class="dv">${r.status}</span></div>`           : '',
    r.zona          ? `<div class="dr"><span class="dl">Zona</span><span class="dv">${r.zona}</span></div>`                : '',
    dims            ? `<div class="dr"><span class="dl">Dimensiones</span><span class="dv">${dims}</span></div>`           : '',
    `<div class="dr dr-url"><span class="dl">Mapa</span><span class="dv url-val">&#128205; ${r.mapUrl}</span></div>`,
  ].filter(Boolean).join('');

  return `
<div class="record-card">
  <div class="card-header">
    <span class="card-num">Registro #${index + 1} de ${total}</span>
    <span class="card-date">${r.savedAt}</span>
  </div>
  <div class="card-body">
    <div class="photo-col">
      <div class="photo-wrap">${photoHtml}</div>
    </div>
    <div class="data-col">
      <div class="data-grid">${dataRows}</div>
    </div>
  </div>
</div>`;
}

// ── HTML completo del reporte (3 registros por página) ────────────────────────
export function buildPDFHTML(cards: string[], fechaReporte: string): string {
  const totalPags = Math.ceil(cards.length / 3);

  const pages = Array.from({ length: totalPags }, (_, p) => {
    const trio = cards.slice(p * 3, p * 3 + 3).join('<div class="card-sep"></div>');
    return `
<div class="page">
  <div class="page-header">
    <span class="app-name">GeoIdea Plus</span>
    <span class="page-info">Reporte de registros &nbsp;·&nbsp; Pág. ${p + 1} de ${totalPags} &nbsp;·&nbsp; ${fechaReporte}</span>
  </div>
  <div class="records-wrap">${trio}</div>
  <div class="page-footer">GeoIdea Plus &nbsp;·&nbsp; ${fechaReporte}</div>
</div>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; }

  /* ── Página ── */
  .page {
    page-break-after: always;
    padding: 6mm 9mm 4mm;
    height: 277mm;
    display: flex;
    flex-direction: column;
  }
  .page:last-child { page-break-after: auto; }

  /* ── Cabecera de página ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2.5px solid #1565C0;
    padding-bottom: 3px;
    margin-bottom: 5px;
    flex-shrink: 0;
  }
  .app-name  { font-size: 13px; font-weight: bold; color: #1565C0; }
  .page-info { font-size: 8px; color: #888; }

  /* ── Contenedor de los 3 registros ── */
  .records-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Separador entre registros */
  .card-sep {
    height: 1px;
    background: #DADADA;
    margin: 3px 0;
    flex-shrink: 0;
  }

  /* ── Tarjeta de registro ── */
  .record-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #E3F2FD;
    border-radius: 3px 3px 0 0;
    padding: 2px 7px;
    margin-bottom: 3px;
    flex-shrink: 0;
  }
  .card-num  { font-size: 8.5px; font-weight: bold; color: #1565C0; }
  .card-date { font-size: 7.5px; color: #777; }

  /* ── Cuerpo: foto + datos ── */
  .card-body {
    display: flex;
    flex: 1;
    gap: 6px;
    min-height: 0;
  }

  /* Columna foto — ocupa todo el alto disponible */
  .photo-col {
    width: 36%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }
  .photo-wrap {
    flex: 1;
    min-height: 0;
    border-radius: 4px;
    overflow: hidden;
  }
  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .photo-placeholder {
    width: 100%;
    height: 100%;
    background: #F5F5F5;
    border: 1.5px dashed #CCC;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #BBB;
    font-size: 9px;
  }

  /* ── Columna datos ── */
  .data-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .data-grid { flex: 1; }

  /* Fila de dato: etiqueta | valor */
  .dr {
    display: flex;
    align-items: baseline;
    padding: 1.8px 0;
    border-bottom: 1px solid #F0F0F0;
  }
  .dl {
    font-size: 7.5px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    width: 34%;
    flex-shrink: 0;
    padding-right: 3px;
  }
  .dv {
    font-size: 9.5px;
    font-weight: 600;
    color: #222;
    flex: 1;
    word-break: break-word;
  }
  .coord { color: #1565C0; font-family: monospace; font-size: 9px; }

  /* Fila URL al final — texto más pequeño y tenue */
  .dr-url { border-bottom: none; padding-top: 3px; }
  .url-val {
    font-size: 6.5px;
    font-weight: normal;
    color: #999;
    word-break: break-all;
    line-height: 1.3;
  }

  /* ── Pie de página ── */
  .page-footer {
    font-size: 7px;
    color: #CCC;
    text-align: center;
    border-top: 1px solid #EEE;
    padding-top: 2px;
    margin-top: 3px;
    flex-shrink: 0;
  }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

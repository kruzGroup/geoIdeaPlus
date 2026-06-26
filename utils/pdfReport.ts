import { type GeoRecord } from '../screens/CapturaScreen';

export type RecordCardData = {
  record: GeoRecord;
  photoB64: string | null;
  index: number;
  total: number;
};

function esc(val: string | null | undefined): string {
  return (val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildRecordCardHTML({ record: r, photoB64, index, total }: RecordCardData): string {
  const dims =
    r.dimWidth || r.dimHeight
      ? [r.dimWidth, r.dimHeight].filter(Boolean).join(' × ') +
        (r.area ? ` (${r.area} m²)` : '')
      : '';

  const fields: [string, string][] = [
    ['Latitud',       r.coordinates.latitude.toFixed(6)],
    ['Longitud',      r.coordinates.longitude.toFixed(6)],
    ['Cuenta',        esc(r.cuenta)       || '—'],
    ['ID Estructura', esc(r.fieldId)      || '—'],
    ['Propietario',   esc(r.propietario)  || '—'],
    ['Estructura',    esc(r.structureType)],
    ['Tecnología',    esc(r.technology)],
    ['Caras',         esc(r.faces)],
    ['Estatus',       esc(r.status)],
    ['Zona',          esc(r.zona)],
    ['Dimensiones',   esc(dims)],
    ['Mapa',          esc(r.mapUrl)],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

  const fieldRows = fields.map(([label, value]) => {
    const isUrl = label === 'Mapa';
    return `<tr>
      <td style="font-size:9px;color:#888;padding:2px 4px 2px 0;vertical-align:top;width:28%;white-space:nowrap;">${label}</td>
      <td style="font-size:${isUrl ? '7px' : '10px'};font-weight:normal;color:${isUrl ? '#1565C0' : '#111'};padding:2px 0;vertical-align:top;word-break:${isUrl ? 'break-all' : 'break-word'};">${value}</td>
    </tr>`;
  }).join('');

  const photoSection = photoB64
    ? `<img src="data:image/jpeg;base64,${photoB64}" width="185" height="175" style="display:block;border-radius:3px;object-fit:cover;" />`
    : `<div style="width:185px;height:175px;background:#f0f0f0;border:1px dashed #ccc;text-align:center;line-height:175px;font-size:9px;color:#aaa;border-radius:3px;">Sin foto</div>`;

  return `
<table width="100%" cellspacing="0" cellpadding="0" border="0"
  style="border:1px solid #ddd;border-radius:4px;margin-bottom:12px;page-break-inside:avoid;">
  <tr style="background:#E3F2FD;">
    <td colspan="2" style="padding:4px 8px;font-size:9px;font-weight:bold;color:#1565C0;font-family:Arial,sans-serif;">
      Registro #${index + 1} de ${total}
      &nbsp;&nbsp;
      <span style="font-weight:normal;color:#777;font-size:8px;">${esc(r.savedAt)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:6px;vertical-align:top;width:30%;">
      ${photoSection}
    </td>
    <td style="padding:6px;vertical-align:top;">
      <table width="100%" cellspacing="0" cellpadding="0" border="0">
        <tbody>${fieldRows}</tbody>
      </table>
    </td>
  </tr>
</table>`;
}

export function buildPDFHTML(cards: string[], fechaReporte: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
<style>
  @page { margin: 16mm; }
  body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
  <table width="100%" cellspacing="0" cellpadding="0" border="0"
    style="margin-bottom:14px;border-bottom:2px solid #1565C0;padding-bottom:6px;">
    <tr>
      <td style="font-size:15px;font-weight:bold;color:#1565C0;">GeoIdea Plus</td>
      <td style="text-align:right;font-size:8px;color:#888;">
        Reporte de registros &nbsp;&middot;&nbsp; ${cards.length} registro${cards.length !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; ${fechaReporte}
      </td>
    </tr>
  </table>
  ${cards.join('\n')}
  <div style="text-align:center;font-size:7px;color:#ccc;border-top:1px solid #eee;padding-top:6px;margin-top:4px;">
    GeoIdea Plus &nbsp;&middot;&nbsp; ${fechaReporte}
  </div>
</body>
</html>`;
}

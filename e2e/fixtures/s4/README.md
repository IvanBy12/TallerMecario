# Fixtures sintéticas S4

`photo.png`: imagen 320×180, texto y figuras sin personas, vehículos reales ni PII.
`video360.mp4`: video AVC/H.264 320×180 generado con canvas + MediaRecorder de
Chromium 1243; duración 1.532367 s, sin audio. Es un recorrido **sintético** enviado
con mediaType video360; no demuestra captura física 360° ni hardware móvil.
Ambos archivos fueron generados localmente para pruebas; no son archivos del usuario.
No modificar MIME/headers firmados. PNG ≤20,971,520 bytes y video360 MP4
≤786,432,000 bytes (B01 §3). No existe máximo numérico de duración aprobado.
La decodificación y reproducción local se verifican en el harness; upload/CORS/
persistencia remotos requieren `npm run e2e:s4` y servicios provisionados.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

// ============ CONFIGURACIÓN ============
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// ============ POSTGRES ============
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'n8n',
  user: process.env.PG_USER || 'n8n',
  password: process.env.PG_PASSWORD || 'n8n123',
});

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============ RUTAS HTML ============
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/index.html', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/test.html', (req, res) => res.sendFile(__dirname + '/test.html'));
app.get('/seguimiento.html', (req, res) => res.sendFile(__dirname + '/seguimiento.html'));
app.get('/panel-empleado.html', (req, res) => res.sendFile(__dirname + '/panel-empleado.html'));
app.get('/tablero.html', (req, res) => res.sendFile(__dirname + '/tablero.html'));
app.get('/ia-recomendaciones.html', (req, res) => res.sendFile(__dirname + '/ia-recomendaciones.html'));

// ============ MULTER ============
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new Error('Solo se permiten imágenes JPG o PNG'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter
});

// ============ BASE64 HELPERS ============
function validarArchivo(ruta) {
  try {
    const stats = fs.statSync(ruta);
    if (stats.size > MAX_FILE_SIZE) throw new Error(`Archivo demasiado grande: ${stats.size} bytes`);
    const ext = path.extname(ruta).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png'];
    if (!allowedExt.includes(ext)) throw new Error(`Extensión no permitida: ${ext}`);
    return true;
  } catch (error) {
    console.error('Error validando archivo:', error.message);
    return false;
  }
}

function archivoABase64(ruta) {
  try {
    if (!validarArchivo(ruta)) return null;
    const buffer = fs.readFileSync(ruta);
    const base64 = buffer.toString('base64');
    const ext = path.extname(ruta).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error leyendo ${ruta}:`, error.message);
    return null;
  }
}

// ============ RUTA: Subir 4 documentos (PRODUCCIÓN) ============
app.post('/api/upload', upload.fields([
  { name: 'id', maxCount: 1 },
  { name: 'domicilio', maxCount: 1 },
  { name: 'ingresos', maxCount: 1 },
  { name: 'referencias', maxCount: 1 }
]), async (req, res) => {
  try {
    const { monto, nombre } = req.body;

    const camposRequeridos = ['id', 'domicilio', 'ingresos', 'referencias'];
    for (const campo of camposRequeridos) {
      if (!req.files[campo] || req.files[campo].length === 0) {
        return res.status(400).json({ error: `Falta el archivo: ${campo}` });
      }
      const file = req.files[campo][0];
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({ error: `El archivo ${campo} excede 2MB` });
      }
    }

    const folio = `SOL-${Date.now()}-${Math.round(Math.random() * 1000)}`;

    const datosN8N = {
      solicitud_id: Date.now(),
      folio: folio,
      monto_solicitado: parseFloat(monto),
      nombre: nombre,
      archivos: {
        id: archivoABase64(req.files.id[0].path),
        domicilio: archivoABase64(req.files.domicilio[0].path),
        ingresos: archivoABase64(req.files.ingresos[0].path),
        referencias: archivoABase64(req.files.referencias[0].path)
      },
      extensiones: {
        id: req.files.id[0].originalname.split('.').pop(),
        domicilio: req.files.domicilio[0].originalname.split('.').pop(),
        ingresos: req.files.ingresos[0].originalname.split('.').pop(),
        referencias: req.files.referencias[0].originalname.split('.').pop()
      }
    };

    console.log('📤 Enviando a n8n (PRODUCCIÓN)...');

    try {
      const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
      const respuesta = await fetch(`${n8nUrl}/webhook-test/evaluacion-credito-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosN8N)
      });
      const resultado = await respuesta.json();
      console.log('✅ Respuesta n8n:', resultado);
    } catch (error) {
      console.error('❌ Error n8n:', error.message);
    }

    res.json({ success: true, folio: folio, mensaje: 'Solicitud recibida' });

  } catch (error) {
    console.error('Error en upload:', error);
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo excede 2MB' });
    if (error.message && error.message.includes('Solo se permiten imágenes')) return res.status(400).json({ error: 'Solo JPG o PNG' });
    res.status(500).json({ error: error.message });
  }
});

// ============ RUTA: Subir 1 documento (MODO PRUEBA) ============
app.post('/api/upload-test', upload.single('documento'), async (req, res) => {
  try {
    const { monto, nombre } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Falta el documento' });

    const folio = `TEST-${Date.now()}`;

    const datosN8N = {
      solicitud_id: Date.now(),
      folio: folio,
      monto_solicitado: parseFloat(monto),
      nombre: nombre,
      modo_prueba: true,
      archivo_unico: archivoABase64(req.file.path),
      extension: req.file.originalname.split('.').pop()
    };

    console.log('📤 Enviando a n8n (PRUEBA)...');

    try {
      const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
      const respuesta = await fetch(`${n8nUrl}/webhook-test/evaluacion-credito-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosN8N)
      });
      const resultado = await respuesta.json();
      console.log('✅ Respuesta n8n:', resultado);
    } catch (error) {
      console.error('❌ Error n8n:', error.message);
    }

    res.json({ success: true, folio: folio, mensaje: 'Solicitud de prueba recibida' });

  } catch (error) {
    console.error('Error en upload-test:', error);
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo excede 2MB' });
    if (error.message && error.message.includes('Solo se permiten imágenes')) return res.status(400).json({ error: 'Solo JPG o PNG' });
    res.status(500).json({ error: error.message });
  }
});

// ============ RUTA: Consultar status (Postgres) ============
app.get('/api/status/:folio', async (req, res) => {
  try {
    // Intentar con razones, caer a sin razones si la columna no existe
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT folio, status, score_credito, motivo_rechazo, monto_solicitado, nombre_completo,
                requiere_revision_manual, motivo_revision_manual, razones
         FROM solicitudes WHERE folio = $1`,
        [req.params.folio]
      ));
    } catch {
      ({ rows } = await pool.query(
        `SELECT folio, status, score_credito, motivo_rechazo, monto_solicitado, nombre_completo,
                requiere_revision_manual, motivo_revision_manual
         FROM solicitudes WHERE folio = $1`,
        [req.params.folio]
      ));
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const s = rows[0];
    res.json({
      folio: s.folio,
      status: s.status,
      score: s.score_credito,
      motivo: s.motivo_rechazo || s.motivo_revision_manual,
      razones: s.razones || [],
      monto: s.monto_solicitado,
      nombre: s.nombre_completo,
      requiere_revision_manual: s.requiere_revision_manual
    });
  } catch (e) {
    console.error('Error en /api/status:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============ RUTA: Revisión manual (Postgres) ============
app.get('/api/revision-manual', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, folio, status, monto_solicitado, nombre_completo, curp,
              score_credito, motivo_revision_manual, fecha_creacion
       FROM solicitudes
       WHERE status = 'revision_manual'
       ORDER BY fecha_creacion DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ RUTA: Aprobar ============
app.post('/api/aprobar/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE solicitudes SET status = 'aprobado', fecha_actualizacion = NOW()
       WHERE id = $1 RETURNING folio, status`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ success: true, ...rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ RUTA: Rechazar ============
app.post('/api/rechazar/:id', async (req, res) => {
  try {
    const motivo = req.body.motivo || 'Rechazado por empleado';
    const { rows } = await pool.query(
      `UPDATE solicitudes SET status = 'rechazado', motivo_rechazo = $1, fecha_actualizacion = NOW()
       WHERE id = $2 RETURNING folio, status`,
      [motivo, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ success: true, ...rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ TABLERO EJECUTIVO ============
app.get('/api/dashboard/kpis', async (req, res) => {
  try {
    const volumen = await pool.query(`
      SELECT
        COUNT(*)::int AS total_solicitudes,
        COUNT(*) FILTER (WHERE status = 'aprobado')::int AS aprobadas,
        COUNT(*) FILTER (WHERE status = 'rechazado')::int AS rechazadas,
        COUNT(*) FILTER (WHERE status = 'revision_manual')::int AS en_revision,
        COUNT(*) FILTER (WHERE status = 'recibido')::int AS recibidas
      FROM solicitudes
    `);
    const montos = await pool.query(`
      SELECT
        COALESCE(SUM(monto_solicitado), 0)::numeric AS monto_total,
        COALESCE(SUM(monto_solicitado) FILTER (WHERE status = 'aprobado'), 0)::numeric AS monto_aprobado,
        COALESCE(SUM(monto_solicitado) FILTER (WHERE status = 'rechazado'), 0)::numeric AS monto_rechazado,
        COALESCE(AVG(monto_solicitado), 0)::numeric AS ticket_promedio
      FROM solicitudes
    `);
    const tiempos = await pool.query(`
      SELECT
        COALESCE(AVG(tiempo_procesamiento), 0)::numeric AS tiempo_promedio,
        MIN(tiempo_procesamiento) AS tiempo_min,
        MAX(tiempo_procesamiento) AS tiempo_max
      FROM solicitudes
      WHERE tiempo_procesamiento IS NOT NULL
    `);

    const v = volumen.rows[0];
    const m = montos.rows[0];
    const t = tiempos.rows[0];

    res.json({
      solicitudes: {
        total: v.total_solicitudes,
        aprobadas: v.aprobadas,
        rechazadas: v.rechazadas,
        en_revision: v.en_revision,
        recibidas: v.recibidas,
        tasa_aprobacion: v.total_solicitudes > 0
          ? ((v.aprobadas / v.total_solicitudes) * 100).toFixed(1)
          : '0.0'
      },
      montos: {
        total: Number(m.monto_total),
        aprobado: Number(m.monto_aprobado),
        rechazado: Number(m.monto_rechazado),
        ticket_promedio: Number(m.ticket_promedio)
      },
      tiempos: {
        promedio_seg: Number(t.tiempo_promedio),
        minimo_seg: t.tiempo_min,
        maximo_seg: t.tiempo_max
      }
    });
  } catch (e) {
    console.error('Error en /api/dashboard/kpis:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard/rechazos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT motivo_rechazo AS motivo, COUNT(*)::int AS total
      FROM solicitudes
      WHERE status = 'rechazado'
        AND motivo_rechazo IS NOT NULL
        AND motivo_rechazo != ''
      GROUP BY motivo_rechazo
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard/volumen', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        DATE(fecha_creacion) AS fecha,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'aprobado')::int AS aprobadas,
        COUNT(*) FILTER (WHERE status = 'rechazado')::int AS rechazadas,
        COUNT(*) FILTER (WHERE status = 'revision_manual')::int AS revision
      FROM solicitudes
      WHERE fecha_creacion >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(fecha_creacion)
      ORDER BY fecha ASC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard/scores', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        CASE
          WHEN score_credito >= 75 THEN 'Alto (75-100)'
          WHEN score_credito >= 50 THEN 'Medio (50-74)'
          WHEN score_credito > 0  THEN 'Bajo (1-49)'
          ELSE 'Sin score'
        END AS rango,
        COUNT(*)::int AS total
      FROM solicitudes
      GROUP BY 1
      ORDER BY
        CASE
          WHEN score_credito >= 75 THEN 1
          WHEN score_credito >= 50 THEN 2
          WHEN score_credito > 0  THEN 3
          ELSE 4
        END
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard/solicitudes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    let query = `
      SELECT id, folio, status, monto_solicitado, nombre_completo,
             curp, score_credito, motivo_rechazo,
             fecha_creacion, fecha_actualizacion, tiempo_procesamiento
      FROM solicitudes
    `;
    const params = [];

    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    query += ` ORDER BY fecha_creacion DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ MÓDULO IA — RECOMENDACIONES ============

// Helper: obtiene KPIs y rechazos para el prompt
async function obtenerDatosIA() {
  const kpis = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'aprobado')::int AS aprobadas,
      COUNT(*) FILTER (WHERE status = 'rechazado')::int AS rechazadas,
      COUNT(*) FILTER (WHERE status = 'revision_manual')::int AS revision,
      COALESCE(AVG(monto_solicitado), 0)::numeric AS ticket_promedio,
      COALESCE(AVG(score_credito), 0)::numeric AS score_promedio
    FROM solicitudes
    WHERE fecha_creacion >= NOW() - INTERVAL '30 days'
  `);
  const rechazos = await pool.query(`
    SELECT motivo_rechazo AS motivo, COUNT(*)::int AS total
    FROM solicitudes
    WHERE status = 'rechazado'
      AND motivo_rechazo IS NOT NULL AND motivo_rechazo != ''
      AND fecha_creacion >= NOW() - INTERVAL '30 days'
    GROUP BY motivo_rechazo
    ORDER BY total DESC
    LIMIT 10
  `);
  return { k: kpis.rows[0], r: rechazos.rows };
}

// Helper: llama a Ollama y devuelve el objeto analisis
async function generarConOllama(k, r) {
  const prompt = `Eres un analista experto en crédito al consumo en México. Analiza estos datos de los últimos 30 días y genera recomendaciones concretas para incrementar la colocación de crédito.

DATOS ACTUALES:
- Total de solicitudes: ${k.total}
- Aprobadas: ${k.aprobadas}
- Rechazadas: ${k.rechazadas}
- En revisión manual: ${k.revision}
- Tasa de aprobación: ${k.total > 0 ? ((k.aprobadas / k.total) * 100).toFixed(1) : 0}%
- Ticket promedio: $${Number(k.ticket_promedio).toFixed(2)} MXN
- Score promedio: ${Number(k.score_promedio).toFixed(1)}/100

PRINCIPALES CAUSAS DE RECHAZO:
${r.map((x, i) => `${i + 1}. ${x.motivo}: ${x.total} casos`).join('\n') || 'Sin rechazos registrados'}

INSTRUCCIONES:
Responde en español, en formato JSON válido, con esta estructura exacta:
{
  "resumen": "Un párrafo corto con el diagnóstico general",
  "recomendaciones": [
    {
      "titulo": "Título corto",
      "descripcion": "Explicación concreta de la acción",
      "impacto": "alto|medio|bajo",
      "esfuerzo": "alto|medio|bajo"
    }
  ],
  "quick_wins": ["Acción rápida 1", "Acción rápida 2"],
  "riesgos": ["Riesgo a monitorear 1", "Riesgo a monitorear 2"]
}

Genera al menos 4 recomendaciones y 3 quick wins. No incluyas texto fuera del JSON.`;

  const ollamaRes = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3', prompt, stream: false, format: 'json', options: { temperature: 0.7, num_predict: 1500 } })
  });
  if (!ollamaRes.ok) throw new Error(`Ollama respondió ${ollamaRes.status}`);
  const ollamaData = await ollamaRes.json();
  try {
    return JSON.parse(ollamaData.response);
  } catch {
    const m = ollamaData.response.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { resumen: ollamaData.response, recomendaciones: [], quick_wins: [], riesgos: [] };
  }
}

// GET — devuelve caché del día o genera si no existe
app.get('/api/ia/recomendaciones', async (req, res) => {
  try {
    // Buscar caché de hoy
    const cache = await pool.query(
      `SELECT * FROM ia_recomendaciones WHERE fecha_analisis = CURRENT_DATE`
    );
    if (cache.rows.length > 0) {
      const row = cache.rows[0];
      return res.json({
        desde_cache: true,
        fecha_analisis: row.generado_en,
        datos: row.datos_snapshot,
        analisis: row.analisis,
        modelo: row.modelo
      });
    }

    // No hay caché — generar
    const { k, r } = await obtenerDatosIA();
    const analisis = await generarConOllama(k, r);
    const datos = {
      total: k.total, aprobadas: k.aprobadas, rechazadas: k.rechazadas,
      revision: k.revision, ticket_promedio: Number(k.ticket_promedio),
      score_promedio: Number(k.score_promedio), causas_rechazo: r
    };

    await pool.query(
      `INSERT INTO ia_recomendaciones (fecha_analisis, datos_snapshot, analisis, modelo)
       VALUES (CURRENT_DATE, $1, $2, 'llama3')
       ON CONFLICT (fecha_analisis) DO UPDATE
         SET analisis = EXCLUDED.analisis,
             datos_snapshot = EXCLUDED.datos_snapshot,
             generado_en = NOW()`,
      [JSON.stringify(datos), JSON.stringify(analisis)]
    );

    res.json({ desde_cache: false, fecha_analisis: new Date().toISOString(), datos, analisis, modelo: 'llama3' });
  } catch (e) {
    console.error('Error en /api/ia/recomendaciones:', e);
    res.status(500).json({ error: e.message, hint: 'Asegúrate de que Ollama esté corriendo: ollama serve' });
  }
});

// POST — fuerza regeneración aunque ya exista caché hoy
app.post('/api/ia/recomendaciones/forzar', async (req, res) => {
  try {
    const { k, r } = await obtenerDatosIA();
    const analisis = await generarConOllama(k, r);
    const datos = {
      total: k.total, aprobadas: k.aprobadas, rechazadas: k.rechazadas,
      revision: k.revision, ticket_promedio: Number(k.ticket_promedio),
      score_promedio: Number(k.score_promedio), causas_rechazo: r
    };

    await pool.query(
      `INSERT INTO ia_recomendaciones (fecha_analisis, datos_snapshot, analisis, modelo)
       VALUES (CURRENT_DATE, $1, $2, 'llama3')
       ON CONFLICT (fecha_analisis) DO UPDATE
         SET analisis = EXCLUDED.analisis,
             datos_snapshot = EXCLUDED.datos_snapshot,
             generado_en = NOW()`,
      [JSON.stringify(datos), JSON.stringify(analisis)]
    );

    res.json({ desde_cache: false, fecha_analisis: new Date().toISOString(), datos, analisis, modelo: 'llama3' });
  } catch (e) {
    console.error('Error en /api/ia/recomendaciones/forzar:', e);
    res.status(500).json({ error: e.message, hint: 'Asegúrate de que Ollama esté corriendo: ollama serve' });
  }
});

// ============ MANEJO DE ERRORES DE MULTER ============
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo excede 2MB' });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log(`📋 Producción: http://localhost:${PORT}/`);
  console.log(`🧪 Pruebas: http://localhost:${PORT}/test.html`);
  console.log(`📋 Seguimiento: http://localhost:${PORT}/seguimiento.html`);
  console.log(`👤 Panel empleado: http://localhost:${PORT}/panel-empleado.html`);
  console.log(`📊 Tablero: http://localhost:${PORT}/tablero.html`);
  console.log(`🤖 IA: http://localhost:${PORT}/ia-recomendaciones.html`);
});
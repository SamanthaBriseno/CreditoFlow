-- Tabla para cachear análisis de IA por día
-- Solo se genera una vez por día; se puede forzar regeneración con el botón
CREATE TABLE IF NOT EXISTS ia_recomendaciones (
  id              SERIAL PRIMARY KEY,
  fecha_analisis  DATE        NOT NULL DEFAULT CURRENT_DATE,
  datos_snapshot  JSONB       NOT NULL,
  analisis        JSONB       NOT NULL,
  modelo          VARCHAR(50) NOT NULL DEFAULT 'llama3',
  generado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ia_fecha UNIQUE (fecha_analisis)
);

CREATE INDEX IF NOT EXISTS idx_ia_fecha ON ia_recomendaciones (fecha_analisis DESC);

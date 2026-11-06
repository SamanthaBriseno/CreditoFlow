-- ============ TABLA: logs_usuario ============
CREATE TABLE IF NOT EXISTS logs_usuario (
  id          SERIAL PRIMARY KEY,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sesion_id   VARCHAR(36),
  accion      VARCHAR(200) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_usuario (fecha DESC);

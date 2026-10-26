// ─────────────────────────────────────────────────────────────────────────────
// QUÉ CUESTA TENER EL BOT ANDANDO
//
// Cada respuesta del bot consume tokens y eso se paga. Sin medirlo no se puede
// decidir nada: no se sabe si el gasto está en el ganadero o en el financiero,
// ni si un cambio sirvió o no.
//
// Guarda una fila por respuesta con lo que consumió y lo que salió, y lo
// devuelve resumido. Es la misma tabla que ya usa el sistema ganadero, así que
// los números se comparan entre sí.
//
// Los tokens de una respuesta no son una llamada sola: el bot consulta la base
// y vuelve a preguntar varias veces. Se suman todas las vueltas.
// ─────────────────────────────────────────────────────────────────────────────

// Precio por millón de tokens: entrada, salida, lectura de caché, escritura.
// Si el modelo no está en la lista se usa el de Sonnet, que es el que corren
// los financieros.
const PRECIOS = {
  "claude-opus-5":     [5, 25, 0.5, 6.25],
  "claude-opus-5-5":   [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-sonnet-5":   [2, 10, 0.2, 2.5],
  "claude-sonnet-4-6": [3, 15, 0.3, 3.75],
  "claude-haiku-5-5":  [1,  5, 0.1, 1.25],
  "claude-haiku-4-5":  [1,  5, 0.1, 1.25]
};

function costoUsd(uso, modelo) {
  const p = PRECIOS[modelo] || PRECIOS["claude-sonnet-4-6"];
  const n = (uso.entrada || 0) * p[0] + (uso.salida || 0) * p[1]
          + (uso.cache_lectura || 0) * p[2] + (uso.cache_escritura || 0) * p[3];
  return Math.round(n / 1e6 * 1e6) / 1e6;
}

function init(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS uso_bot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL, modelo TEXT, canal TEXT, usuario TEXT,
        entrada INTEGER DEFAULT 0, salida INTEGER DEFAULT 0,
        cache_lectura INTEGER DEFAULT 0, cache_escritura INTEGER DEFAULT 0,
        vueltas INTEGER DEFAULT 0, segundos REAL, usd REAL,
        created_at TEXT DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_uso_fecha ON uso_bot(fecha);
    `);
  } catch (e) { console.log("⚠️  uso.init:", e.message); }
}

/** Suma lo que devolvió una llamada a la API. Se llama una vez por vuelta. */
function sumar(acum, respuesta) {
  const u = (respuesta && respuesta.usage) || {};
  acum.entrada         += u.input_tokens || 0;
  acum.salida          += u.output_tokens || 0;
  acum.cache_lectura   += u.cache_read_input_tokens || 0;
  acum.cache_escritura += u.cache_creation_input_tokens || 0;
  acum.vueltas++;
  return acum;
}

const nuevo = () => ({ entrada: 0, salida: 0, cache_lectura: 0, cache_escritura: 0, vueltas: 0 });

/** Anota lo que costó una respuesta. Nunca hace fallar al bot. */
function registrar(db, { modelo, canal, usuario, uso, segundos } = {}) {
  if (!uso) return null;
  const usd = costoUsd(uso, modelo);
  try {
    db.prepare(`INSERT INTO uso_bot
      (fecha, modelo, canal, usuario, entrada, salida, cache_lectura, cache_escritura, vueltas, segundos, usd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(new Date().toISOString().slice(0, 10), modelo || null, canal || "web", usuario || null,
        uso.entrada, uso.salida, uso.cache_lectura, uso.cache_escritura,
        uso.vueltas || 0, segundos != null ? segundos : null, usd);
  } catch (e) {}
  return usd;
}

/** El gasto, para mirarlo sin entrar a los logs. */
function resumen(db, { desde, hasta } = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const d = desde || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const h = hasta || hoy;
  const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return []; } };
  const uno = (sql, ...p) => { try { return db.prepare(sql).get(...p) || {}; } catch (e) { return {}; } };

  const per = uno(`SELECT COUNT(*) consultas, COALESCE(SUM(entrada),0) entrada, COALESCE(SUM(salida),0) salida,
    COALESCE(SUM(cache_lectura),0) cache_lectura, COALESCE(SUM(cache_escritura),0) cache_escritura,
    COALESCE(SUM(usd),0) usd FROM uso_bot WHERE fecha BETWEEN ? AND ?`, d, h);

  // Lo que se habría pagado sin caché: todo lo leído de caché a precio de entrada.
  let ahorro = 0;
  for (const m of q(`SELECT modelo, COALESCE(SUM(cache_lectura),0) cl FROM uso_bot
    WHERE fecha BETWEEN ? AND ? GROUP BY modelo`, d, h)) {
    const p = PRECIOS[m.modelo] || PRECIOS["claude-sonnet-4-6"];
    ahorro += m.cl * (p[0] - p[2]) / 1e6;
  }

  return {
    modelo_configurado: process.env.MODELO || null,
    desde: d, hasta: h,
    hoy: uno(`SELECT COUNT(*) consultas, ROUND(COALESCE(SUM(usd),0),2) usd FROM uso_bot WHERE fecha=?`, hoy),
    mes: uno(`SELECT COUNT(*) consultas, ROUND(COALESCE(SUM(usd),0),2) usd FROM uso_bot WHERE fecha LIKE ?`, hoy.slice(0, 7) + "%"),
    periodo: { ...per, usd: Math.round(per.usd * 100) / 100,
      promedio_por_consulta: per.consultas ? Math.round(per.usd / per.consultas * 10000) / 10000 : 0,
      ahorro_cache: Math.round(ahorro * 100) / 100 },
    por_dia: q(`SELECT fecha, COUNT(*) consultas, ROUND(SUM(usd),2) usd FROM uso_bot
      WHERE fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha DESC`, d, h),
    por_canal: q(`SELECT canal, COUNT(*) consultas, ROUND(SUM(usd),2) usd FROM uso_bot
      WHERE fecha BETWEEN ? AND ? GROUP BY canal ORDER BY usd DESC`, d, h),
    por_modelo: q(`SELECT modelo, COUNT(*) consultas, ROUND(SUM(usd),2) usd,
      ROUND(AVG(usd),4) promedio FROM uso_bot WHERE fecha BETWEEN ? AND ? GROUP BY modelo ORDER BY usd DESC`, d, h)
  };
}

module.exports = { init, nuevo, sumar, registrar, resumen, costoUsd, PRECIOS };

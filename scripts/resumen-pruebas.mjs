// Arma el resumen en markdown de una ejecución de pruebas para el resumen del job de GitHub Actions.
// Lee el reporte JSON de vitest y el json-summary de cobertura; si falta alguno lo dice en vez de fallar.
// Uso: node scripts/resumen-pruebas.mjs <test-results.json> <coverage-summary.json> >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const [resultsPath, coveragePath] = process.argv.slice(2);
// Se lee de `coverageThresholds` del target `test` de angular.json para no repetir el número aquí.
const UMBRAL = Number(
  Object.values(JSON.parse(readFileSync("angular.json", "utf8")).projects)[0].architect.test.options.coverageThresholds?.lines ?? NaN,
);
const METRICAS = [
  ["lines", "Líneas"],
  ["statements", "Sentencias"],
  ["functions", "Funciones"],
  ["branches", "Ramas"],
];

const leer = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const icono = (ok) => (ok ? "✅" : "❌");
const out = [];

out.push("## Pruebas unitarias", "");

const results = leer(resultsPath);
if (!results) {
  out.push("❌ No se generó el reporte de pruebas: la ejecución falló antes de terminar (ver el log del paso).", "");
} else {
  const ok = results.numFailedTests === 0 && results.numFailedTestSuites === 0;
  out.push(
    `${icono(ok)} **${results.numPassedTests} de ${results.numTotalTests} pruebas pasan** ` +
      `en ${results.testResults.length} archivos` +
      (results.numFailedTests ? ` — **${results.numFailedTests} fallan**` : "") +
      (results.numPendingTests ? ` — ${results.numPendingTests} omitidas` : ""),
    "",
  );
  const fallidas = results.testResults.flatMap((suite) =>
    suite.assertionResults
      .filter((t) => t.status === "failed")
      .map((t) => ({ archivo: path.relative(process.cwd(), suite.name).replaceAll("\\", "/"), t })),
  );
  // Un archivo que no llega a cargar (error de import, de sintaxis) falla sin pruebas que listar.
  const suitesRotas = results.testResults.filter((s) => s.status === "failed" && s.assertionResults.every((t) => t.status !== "failed"));
  if (fallidas.length || suitesRotas.length) {
    out.push("### Fallos", "", "| Archivo | Prueba | Error |", "|---|---|---|");
    for (const { archivo, t } of fallidas) {
      const error = (t.failureMessages[0] ?? "").split("\n")[0].replaceAll("|", "\\|").slice(0, 200);
      out.push(`| \`${archivo}\` | ${t.fullName.replaceAll("|", "\\|")} | ${error} |`);
    }
    for (const s of suitesRotas) {
      const error = (s.message ?? "").split("\n")[0].replaceAll("|", "\\|").slice(0, 200);
      out.push(`| \`${path.relative(process.cwd(), s.name).replaceAll("\\", "/")}\` | (el archivo no cargó) | ${error} |`);
    }
    out.push("");
  }
}

const coverage = leer(coveragePath);
out.push(`### Cobertura (umbral ${UMBRAL} %)`, "");
if (!coverage) {
  out.push("❌ No se generó el reporte de cobertura (no se escribe si alguna prueba falla).", "");
} else {
  out.push("| Métrica | Cubierto | % | |", "|---|---|---|---|");
  for (const [clave, nombre] of METRICAS) {
    const m = coverage.total[clave];
    out.push(`| ${nombre} | ${m.covered} / ${m.total} | ${m.pct} % | ${icono(m.pct >= UMBRAL)} |`);
  }
  out.push("");

  const archivos = Object.entries(coverage)
    .filter(([k]) => k !== "total")
    .map(([k, v]) => ({ archivo: path.relative(process.cwd(), k).replaceAll("\\", "/"), v }))
    .sort((a, b) => Math.min(...METRICAS.map(([c]) => a.v[c].pct)) - Math.min(...METRICAS.map(([c]) => b.v[c].pct)) || a.archivo.localeCompare(b.archivo));
  const bajos = archivos.filter(({ v }) => METRICAS.some(([c]) => v[c].pct < 100));
  out.push(bajos.length ? `**${bajos.length} archivos** no están al 100 % (primeros en la tabla).` : "Todos los archivos están al 100 %.", "");
  out.push(`<details><summary>Cobertura por archivo (${archivos.length})</summary>`, "");
  out.push("| Archivo | Líneas | Sentencias | Funciones | Ramas |", "|---|---|---|---|---|");
  for (const { archivo, v } of archivos) {
    out.push(`| \`${archivo}\` | ${METRICAS.map(([c]) => `${v[c].pct} %`).join(" | ")} |`);
  }
  out.push("", "</details>", "");
}

process.stdout.write(out.join("\n") + "\n");

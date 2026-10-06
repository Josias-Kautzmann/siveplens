import test from "node:test";
import assert from "node:assert/strict";
import { handleBivariada } from "../mcp/src/tools/bivariada.ts";
import { handleRegressao } from "../mcp/src/tools/regressao.ts";
import { NextRequest } from "next/server.js";

// Dummy connection only: all analytic API calls below are mocked, no database is contacted.
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.SITE_URL = "http://localhost:3000";
delete process.env.MCP_ACCESS_TOKEN;
const { POST } = await import("../src/app/api/mcp/route.ts");
const manifest = { schemaVersion: "siveplens-analysis-spec/v2", analysisId: "audit-test", source: { provenance: { status: "partial", warnings: ["Fonte incompleta"] } }, configuration: {}, filters: { ano_epi: 2024 }, cohort: { effectiveN: 100 } };
const bivariate = { cells: [{vx:"1",vy:"1",n:10},{vx:"1",vy:"2",n:20},{vx:"2",vy:"1",n:30},{vx:"2",vy:"2",n:40}], totalN: 100, excludedN: 0, manifest };
const regression = { coeficientes: [{nome:"Sexo feminino",aOR:0.5,ci95Low:0.3,ci95High:0.8,pValue:0.01},{nome:"Masculino (ref.)",aOR:1,ci95Low:1,ci95High:1,pValue:null,isReferencia:true}], meta: {n:100,nRaw:100,nExcluded:0,events:20,taxaEventos:0.2,aic:100,deviance:90,devianceNull:110,r2McFadden:0.1,converged:true,iteracoes:6}, outcome:{campo:"evolucao_bin",label:"Óbito",eventLabel:"Óbito"}, avisos:[], manifest };
async function remote(name, args) {
  const response = await POST(new NextRequest("http://localhost:3000/api/mcp", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}}) }));
  assert.equal(response.status,200);
  return (await response.json()).result.content[0].text;
}

for (const transport of ["stdio", "http"]) {
  test(`${transport}: bivariate response preserves the complete manifest, including empty cohorts`, async (t) => {
    let data = bivariate;
    t.mock.method(globalThis,"fetch",async () => Response.json(data));
    const args={varX:"diabetes",varY:"evolucao_bin",filtros:{ano_epi:2024}};
    const call=()=>transport==="stdio" ? handleBivariada(args,"http://localhost:3000") : remote("consultar_bivariada",args);
    for (const cells of [bivariate.cells,[]]) {
      data={...bivariate,cells};
      assert.ok((await call()).includes(JSON.stringify(manifest,null,2)));
    }
  });
  test(`${transport}: regression preserves evidence and actual references, and stops failed inference`, async (t) => {
    let data=regression;
    t.mock.method(globalThis,"fetch",async () => Response.json(data));
    const args={outcome:"evolucao_bin",preditores:["cs_sexo"]};
    const call=()=>transport==="stdio" ? handleRegressao(args,"http://localhost:3000") : remote("consultar_regressao",args);
    const ok=await call();
    assert.ok(ok.includes(JSON.stringify(manifest,null,2)));
    assert.match(ok,/Categorias de referência: Masculino/);
    for (const invalid of [false,true]) {
      data={...regression,meta:{...regression.meta,converged:invalid},coeficientes:invalid ? [{...regression.coeficientes[0],pValue:null}] : regression.coeficientes};
      const text=await call();
      assert.match(text,/SEM INTERPRETAÇÃO AUTOMÁTICA/);
      assert.doesNotMatch(text,/PREDITORES SIGNIFICATIVOS/);
      assert.ok(text.includes(JSON.stringify(manifest,null,2)));
    }
  });
}

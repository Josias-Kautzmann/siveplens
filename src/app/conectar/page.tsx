import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "../_components/SiteHeader";
import CopyBox from "./_components/CopyBox";

export const metadata: Metadata = {
  title:       "Conectar assistentes de IA — SivepLens",
  description: "Conecte Claude ou modelos GPT aos microdados do SIVEP-Gripe por meio do servidor MCP do SivepLens.",
};

const SITE    = (process.env.SITE_URL ?? "https://siveplens.literato.io").replace(/\/$/, "");
const MCP_URL = `${SITE}/api/mcp`;

// ── Tools expostas pelo MCP ────────────────────────────────────────────────────

const TOOLS = [
  {
    nome:  "resumir_variavel",
    desc:  "Estatísticas descritivas com N total/válido, ausências, média, DP, mediana, quartis e manifesto reproduzível dos filtros.",
    icon:  "∑",
  },
  {
    nome:  "consultar_panorama",
    desc:  "Indicadores de SRAG (casos, óbitos, letalidade, UTI) e tendência semanal, com desagregação por etiologia, faixa etária ou sexo.",
    icon:  "▦",
  },
  {
    nome:  "prevalencia_recente",
    desc:  "Qual vírus predomina nas últimas semanas (SARS-CoV-2, Influenza, VSR…), com positividade de PCR e agente predominante.",
    icon:  "◔",
  },
  {
    nome:  "consultar_alertas",
    desc:  "Detecção ao vivo de anomalias na curva semanal (z-score sobre média móvel): sinaliza picos atípicos e o status da última semana.",
    icon:  "◭",
  },
  {
    nome:  "perfil_sintomatologico",
    desc:  "Prevalência de cada sintoma e letalidade entre quem o apresentou — destaca sinais de gravidade (dispneia, saturação baixa…).",
    icon:  "❤",
  },
  {
    nome:  "consultar_bivariada",
    desc:  "Tabela de contingência entre duas variáveis com qui-quadrado, V de Cramér, Odds Ratio e Risco Relativo (IC 95%).",
    icon:  "⊞",
  },
  {
    nome:  "consultar_regressao",
    desc:  "Regressão logística multivariada (IRLS) com aOR, IC 95% e p-valor para cada preditor, ajustando para os demais. Categoria de referência configurável.",
    icon:  "∫",
  },
  {
    nome:  "listar_variaveis",
    desc:  "Lista todas as variáveis analisáveis do SIVEP-Gripe — desfechos, comorbidades, sintomas, vacinação — com seus códigos e avisos.",
    icon:  "▤",
  },
];

// ── Prompts de exemplo ─────────────────────────────────────────────────────────

const PROMPTS = [
  "Qual é a média e a mediana de idade dos óbitos por SRAG com diabetes classificados como COVID-19? Informe N e ausências.",
  "Quantos casos e óbitos de SRAG em SP em 2025? Qual a letalidade?",
  "Qual vírus está predominando nas últimas semanas no Brasil?",
  "Há algum pico atípico de SRAG no RS este ano?",
  "Quais sintomas estão mais associados a óbito por SRAG?",
  "Pacientes com diabetes têm mais óbitos por SRAG? Roda uma bivariada.",
  "Após ajustar para sexo e faixa etária, quais comorbidades aumentam o risco de UTI?",
];

// ── Config local (modo avançado) ───────────────────────────────────────────────

const LOCAL_CONFIG = `{
  "mcpServers": {
    "siveplens": {
      "command": "node",
      "args": ["/caminho/para/mcp/dist/index.js"],
      "env": { "SIVEPLENS_API_URL": "${SITE}" }
    }
  }
}`;

const OPENAI_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI();
const response = await client.responses.create({
  model: "gpt-5.6",
  tools: [{
    type: "mcp",
    server_label: "siveplens",
    server_url: "${MCP_URL}",
    require_approval: "never"
  }],
  input: "Qual é a média de idade dos óbitos com diabetes classificados como COVID-19? Mostre N e ausências."
});

console.log(response.output_text);`;

// ── Página ──────────────────────────────────────────────────────────────────────

export default function ConectarPage() {
  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        {/* Breadcrumb + título */}
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2a6b55] hover:text-[#1a3a30] transition-colors">
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 1L3 6l5 5"/></svg>
            Início
          </Link>
          <h1 className="text-2xl font-bold text-[#1C1C1C] mt-2">Conectar assistentes de IA</h1>
          <p className="text-sm text-[#555770] mt-1 max-w-2xl leading-relaxed">
            Conecte Claude ou modelos GPT aos microdados do SIVEP-Gripe e peça análises epidemiológicas
            em linguagem natural. Os cálculos são determinísticos e rodam no servidor; o modelo escolhe e explica as operações.
          </p>
        </div>

        {/* ── Conector remoto (destaque) ─────────────────────────────────── */}
        <section className="bg-white rounded-2xl border-2 border-[#1a3a30] shadow-sm overflow-hidden">
          <div className="bg-[#1a3a30] px-6 py-3 flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#c2e8df] uppercase tracking-widest">Recomendado</span>
            <span className="text-[11px] text-[#a8d5c7]">· conexão em ~30 segundos, sem instalar nada</span>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-[#1C1C1C]">Conector remoto</h2>
              <p className="text-sm text-[#555770] mt-1">
                Cole esta URL como conector personalizado no Claude. O servidor oferece acesso público e somente leitura a dados públicos.
              </p>
            </div>

            <CopyBox value={MCP_URL} label="Copiar URL" />

            {/* Passo a passo */}
            <ol className="space-y-3">
              {[
                <>No Claude (web ou desktop), abra <strong>Configurações → Conectores</strong>.</>,
                <>Clique em <strong>Adicionar conector personalizado</strong> (<span className="italic">Add custom connector</span>).</>,
                <>Cole a URL acima e clique em <strong>Conectar</strong>.</>,
                <>Pronto — comece a pedir análises. O Claude usará as ferramentas automaticamente.</>,
              ].map((passo, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#eaf5f1] text-[#1a3a30] text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-sm text-[#1C1C1C] leading-relaxed pt-0.5">{passo}</span>
                </li>
              ))}
            </ol>

            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              <strong>Requisito:</strong> conectores personalizados estão disponíveis nos planos Claude Pro, Max, Team e Enterprise.
              Os dados consultados são públicos (SIVEP-Gripe / OpenDataSUS).
            </p>
          </div>
        </section>

        {/* ── Tools disponíveis ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-1">O que o assistente poderá fazer</h2>
          <p className="text-xs text-[#555770] mb-4">Oito ferramentas expostas pelo servidor MCP — da descrição auditável à regressão multivariada</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TOOLS.map((t) => (
              <div key={t.nome} className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
                <div className="text-2xl text-[#1a3a30] mb-2 font-serif leading-none">{t.icon}</div>
                <code className="text-xs font-mono text-[#1a3a30] font-bold">{t.nome}</code>
                <p className="text-xs text-[#555770] mt-2 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Prompts de exemplo ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-1">Exemplos para começar</h2>
          <p className="text-xs text-[#555770] mb-4">Copie e cole no assistente depois de conectar</p>
          <div className="space-y-2.5">
            {PROMPTS.map((p) => (
              <div key={p} className="flex items-center gap-3 bg-white rounded-lg border border-[#c5ddd6] px-4 py-3">
                <span className="text-[#2a6b55] shrink-0">💬</span>
                <span className="flex-1 text-sm text-[#1C1C1C]">{p}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── OpenAI Responses API ─────────────────────────────────────── */}
        <section>
          <details className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden group">
            <summary className="px-6 py-4 cursor-pointer select-none flex items-center justify-between hover:bg-[#f4fbf8] transition-colors">
              <div>
                <h2 className="text-base font-bold text-[#1C1C1C]">GPT via OpenAI Responses API</h2>
                <p className="text-xs text-[#555770] mt-0.5">Use o mesmo servidor remoto como uma ferramenta MCP do modelo</p>
              </div>
              <svg className="w-4 h-4 text-[#94A3B8] shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4"/></svg>
            </summary>
            <div className="px-6 pb-6 space-y-4 border-t border-[#eaf5f1] pt-4">
              <p className="text-sm text-[#555770] leading-relaxed">
                A Responses API aceita servidores MCP remotos por <code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">server_url</code>.
                O exemplo requer uma chave de API da OpenAI no ambiente e não envia os microdados ao modelo: apenas os resultados das ferramentas.
              </p>
              <CopyBox value={OPENAI_EXAMPLE} multiline label="Copiar exemplo" />
              <Link
                href="https://developers.openai.com/api/docs/guides/tools-connectors-mcp"
                className="inline-flex text-xs font-semibold text-[#2a6b55] underline"
              >
                Documentação oficial da OpenAI sobre MCP
              </Link>
            </div>
          </details>
        </section>

        {/* ── Modo local / avançado ──────────────────────────────────────── */}
        <section>
          <details className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden group">
            <summary className="px-6 py-4 cursor-pointer select-none flex items-center justify-between hover:bg-[#f4fbf8] transition-colors">
              <div>
                <h2 className="text-base font-bold text-[#1C1C1C]">Modo local (avançado · desenvolvedores)</h2>
                <p className="text-xs text-[#555770] mt-0.5">Rodar o servidor MCP via stdio no Claude Desktop, a partir do código-fonte</p>
              </div>
              <svg className="w-4 h-4 text-[#94A3B8] shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4"/></svg>
            </summary>

            <div className="px-6 pb-6 space-y-4 border-t border-[#eaf5f1] pt-4">
              <p className="text-sm text-[#555770] leading-relaxed">
                Para quem clonou o repositório: após <code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">npm install</code> e
                {" "}<code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">npm run build</code> dentro de <code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">mcp/</code>,
                adicione o bloco abaixo ao <code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">claude_desktop_config.json</code> e
                ajuste o caminho do <code className="font-mono bg-[#eaf5f1] px-1 rounded text-xs">args</code>.
              </p>
              <CopyBox value={LOCAL_CONFIG} multiline label="Copiar config" />
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                A variável <code className="font-mono text-[#555770]">SIVEPLENS_API_URL</code> aponta o servidor local para a API de análise.
                Use a URL pública acima ou <code className="font-mono text-[#555770]">http://localhost:3000</code> em desenvolvimento.
              </p>
            </div>
          </details>
        </section>

        <p className="text-xs text-[#94A3B8] pb-4 leading-relaxed">
          Protocolo MCP (Model Context Protocol) por Streamable HTTP. Todas as análises são executadas
          sobre os microdados SIVEP-Gripe / OpenDataSUS — os mesmos dados do <Link href="/painel" className="text-[#2a6b55] underline">painel</Link> e da <Link href="/analise" className="text-[#2a6b55] underline">análise</Link>.
        </p>

      </main>
    </div>
  );
}

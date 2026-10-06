/**
 * SivepLens MCP Server
 *
 * Exposição de ferramentas para consulta epidemiológica do SIVEP-Gripe
 * via Claude Desktop / qualquer cliente MCP.
 *
 * Configuração no Claude Desktop (claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "siveplens": {
 *       "command": "node",
 *       "args": ["/caminho/para/mcp/dist/index.js"],
 *       "env": { "SIVEPLENS_API_URL": "https://seu-site.vercel.app" }
 *     }
 *   }
 * }
 *
 * Para desenvolvimento local (sem build):
 * {
 *   "mcpServers": {
 *     "siveplens": {
 *       "command": "npx",
 *       "args": ["tsx", "/caminho/para/mcp/src/index.ts"],
 *       "env": { "SIVEPLENS_API_URL": "http://localhost:3000" }
 *     }
 *   }
 * }
 */

import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOL_CATALOGO,  handleCatalogo  } from "./tools/catalogo.js";
import { TOOL_BIVARIADA, handleBivariada } from "./tools/bivariada.js";
import { TOOL_REGRESSAO, handleRegressao } from "./tools/regressao.js";
import { TOOL_DESCRITIVA, handleDescritiva } from "./tools/descritiva.js";

// ── Configuração ──────────────────────────────────────────────────────────────

const API_URL = (process.env.SIVEPLENS_API_URL ?? process.env.SADDS_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ── Servidor MCP ──────────────────────────────────────────────────────────────

const server = new Server(
  {
    name:    "siveplens",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  },
);

// ── Listar tools disponíveis ──────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [TOOL_CATALOGO, TOOL_DESCRITIVA, TOOL_BIVARIADA, TOOL_REGRESSAO],
}));

// ── Executar uma tool ─────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let text: string;

    switch (name) {
      case "listar_variaveis":
        text = handleCatalogo(args as { categoria?: string });
        break;

      case "consultar_bivariada":
        text = await handleBivariada(
          args as unknown as Parameters<typeof handleBivariada>[0],
          API_URL,
        );
        break;

      case "resumir_variavel":
        text = await handleDescritiva(
          args as unknown as Parameters<typeof handleDescritiva>[0],
          API_URL,
        );
        break;

      case "consultar_regressao":
        text = await handleRegressao(
          args as unknown as Parameters<typeof handleRegressao>[0],
          API_URL,
        );
        break;

      default:
        text = `Tool desconhecida: "${name}". Tools disponíveis: listar_variaveis, resumir_variavel, consultar_bivariada, consultar_regressao.`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `❌ Erro interno: ${msg}` }],
      isError: true,
    };
  }
});

// ── Iniciar ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Não usar console.log — a comunicação stdio é reservada para o protocolo MCP.
  // Logs de debug devem ir para stderr:
  // process.stderr.write("SivepLens MCP server iniciado\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

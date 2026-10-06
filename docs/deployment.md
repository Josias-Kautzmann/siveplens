# Implantação na Vercel

Conecte o repositório `Josias-Kautzmann/siveplens` à Vercel e use a raiz do
projeto, com preset Next.js, Node.js 24 e o comando padrão `npm run build`.

## Variáveis da aplicação

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | URL de conexão PostgreSQL do banco existente. |
| `DATABASE_READ_ONLY` | Use `true` para as consultas da aplicação. Não configura os scripts Python. |
| `SITE_URL` | Origem pública desta implantação, por exemplo `https://siveplens.literato.io`. É usada pelas chamadas internas do MCP. |
| `MCP_ACCESS_TOKEN` | Opcional; restringe o MCP por Bearer token. |
| `MIN_DESCRIPTIVE_COHORT_SIZE` | Opcional; limiar de supressão da descritiva, com padrão 10. |
| `GITHUB_REPO` | `Josias-Kautzmann/siveplens`, para o acionamento opcional do ETL. |
| `GITHUB_TOKEN` e `ETL_SECRET` | Somente se for usar o endpoint autenticado de acionamento do ETL. |

Transfira os valores pelo painel de configuração do provedor. Não inclua
credenciais em arquivos versionados. Preserve o domínio público usado no artigo
e mantenha `SITE_URL` coerente com ele.

## Atualização dos dados

O ETL é executado fora da Vercel. Para habilitá-lo no novo repositório,
configure `DATABASE_URL` nos segredos do GitHub e `ENABLE_ETL=true` nas
variáveis do repositório. Antes disso, desative o agendamento equivalente no
repositório anterior para evitar cargas concorrentes. Nenhuma carga é
necessária apenas para trocar o repositório da aplicação.

## Conferência após a troca

- Abra a aplicação, a documentação e `/artigo/eramia-2026`.
- Execute uma análise e confira o JSON com manifesto.
- Confira os links de código-fonte, ETL e reprodução na documentação.
- Se utilizar MCP, confira a conexão com o domínio definitivo.

Não aplique migrações ou rotinas de setup ao banco existente apenas para
efetuar a troca de repositório.

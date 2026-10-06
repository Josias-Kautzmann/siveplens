# SivepLens

Plataforma web para exploração e análise auditável de dados do SIVEP-Gripe. Integra estatísticas descritivas, tabelas de contingência, regressão logística, visualizações e ferramentas MCP para assistentes.

[Aplicação](https://siveplens.literato.io/) · [Artigo e evidências](https://siveplens.literato.io/artigo/eramia-2026) · [ETL](etl-python/README.md) · [Reprodução](research/README.md) · [Implantação](docs/deployment.md)

A aplicação usa **Next.js 16, React 19, TypeScript, Drizzle e PostgreSQL**. A ingestão é feita em Python. O banco pode estar na Neon ou em outra instalação PostgreSQL compatível.

## Executar com um banco existente

Requisitos testados: Node.js 24, npm, Python 3.12 ou superior para o ETL e os scripts de pesquisa.

```sh
npm ci
npm ci --prefix mcp
```

Copie `.env.example` para `.env.local` e configure `DATABASE_URL` com a URL PostgreSQL completa. A chave administrativa da API da Neon não é necessária. Mantenha `SITE_URL=http://localhost:3000` para que o MCP local consulte a aplicação local. Para testes em uma base existente, mantenha `DATABASE_READ_ONLY=true`.

```sh
npm run dev
```

Abra http://localhost:3000. `.env.local` é ignorado pelo Git. O modo somente leitura é aplicado às conexões da aplicação; scripts de ETL têm configuração e finalidade próprias.

## Arquitetura

```text
Arquivos SIVEP-Gripe / OpenDataSUS
  → ETL Python: normalização, deduplicação e manifesto da fonte
  → PostgreSQL: casos, dimensão municipal, controle de carga, manifesto_fonte
  → DAL + motor estatístico determinístico
  → páginas web e API de análises
  → MCP remoto (/api/mcp) e servidor stdio (mcp/)
```

O motor logístico compartilhado está em `src/lib/logistic-regression.ts`. O manifesto das análises é construído em `src/dal/analysis-manifest.ts`. Assistentes selecionam operações permitidas; não recebem execução arbitrária de SQL.

## Banco novo e ingestão

Uma base vazia não contém dados para os exemplos. Use um banco ou branch de desenvolvimento separado para experimentar a ingestão.

1. Configure `DATABASE_URL` para o banco novo e confira o destino.
2. Gere/aplique o esquema de `src/db/schema.ts` nesse banco: `node --env-file=.env.local node_modules/drizzle-kit/bin.cjs push`.
3. Instale `pip install -r etl-python/requirements.txt` em um ambiente Python.
4. Configure `DATABASE_URL` em `etl-python/.env` (ou no ambiente do processo). Os scripts Python carregam esse arquivo, não `.env.local`.
5. Instale também a rotina `refresh_semana_mun()` de `drizzle/neon_setup.sql`; o Drizzle sincroniza tabelas, mas não cria essa rotina usada nas cargas.
6. Consulte `etl-python/seed_dim_municipio.py` para a dimensão geográfica e `etl-python/load_influd.py <caminho-absoluto-do-CSV>` para carregar um arquivo explicitamente escolhido. Os scripts escrevem no banco. `update_csv.py` é o fluxo de atualização usado no workflow de ETL.

Os SQLs em `drizzle/` registram etapas históricas do projeto. Para uma base existente, não execute setup ou carga apenas para iniciar a aplicação. O roteiro detalhado de insumos e carga está em [etl-python/README.md](etl-python/README.md).

## Percurso de demonstração

- `/analise/descritiva?ano=2024&modo=numerica&variavel=idade_anos`: confira população, valores válidos e ausentes.
- `/analise/associacao?ano=2024`: selecione exposição e desfecho e execute a análise.
- `/analise/regressao?ano=2024&out=evolucao_bin&preds=cs_sexo,diabetes&ref_sexo=M`: modelo pequeno com referência masculina explícita.
- `/artigo/eramia-2026`: evidências da Tabela 1, diferenciando resultados usados no artigo, teste controlado e base atual.
- `/docs/validacao`: protocolo de comparação com estudos publicados.

A interpretação automática da regressão é suspensa quando há falha de convergência ou estimativas instáveis/indisponíveis. As referências vêm do modelo retornado, não de valores fixos. OR descreve associação em odds; não é razão de probabilidades nem demonstra causalidade.

## Exportar e reexecutar uma análise

**CSV** exporta tabelas/resumos ou coeficientes. **JSON + manifesto** exporta resultados e a configuração da análise, com filtros, denominadores, exclusões, fonte e avisos. Não é uma exportação de microdados individuais nem de uma matriz de treinamento.

1. Execute uma análise e baixe **JSON + manifesto**.
2. Com a aplicação funcionando, execute:

```sh
npm run replay:analysis -- caminho/analise.json caminho/reexecucao.json
```

Opcionalmente, acrescente a URL de outra instalação compatível ao final. O script suporta descritiva numérica, categórica, associação e regressão; restaura referências e tratamento de ausências. A saída preserva o novo resultado e compara ID, arquivos-fonte e coorte. O arquivo de entrada não é sobrescrito, e a saída precisa ser nova.

Reexecução usa a base disponível no momento. Um link ou um hash não substitui a preservação do snapshot histórico. “Arquivos-fonte identificados” significa que os arquivos dos anos consultados têm identidade registrada; “Proveniência parcial” indica lacunas explícitas. Ambos os transportes MCP preservam o manifesto bivariado e de regressão, inclusive em resultados sem interpretação automática.

## Verificações

```sh
npm test
npm run lint
npm run typecheck
npm run build --prefix mcp
python -m unittest discover -s etl-python/tests -v
```

O workflow `quality.yml` executa essas verificações sem credenciais de produção. Com banco configurado e aplicação local em execução:

```sh
npm run test:live
npm run validate:science
```

Esses comandos consultam dados e gravam evidências em `research/local/`, ignorado pelo Git. `validate:science` força conexão somente leitura. Para `test:live`, use `DATABASE_READ_ONLY=true` na aplicação. Ele verifica quatro análises, reexecução, MCP, entradas inválidas e endpoints de validação/artigo. Para produção: `npm run build` e `npm start`. O build verifica tipos e pode precisar de conexão com o banco e de rede para fontes/recursos externos.

## Reprodução dos estudos do artigo

O protocolo completo está em [research/README.md](research/README.md). As contagens na carga corrente e o teste controlado sobre o XLSX dos autores são verificações diferentes. Resultados arquivados em `research/` e `public/artifacts/` não são substituídos automaticamente por novas execuções.

## Limites

A ferramenta não fornece diagnóstico individual, recomendações clínicas ou demonstração causal. Comparações próximas e sobreposição de intervalos de confiança não são testes formais de equivalência. Filtros, dados ausentes e versões da base podem mudar a população efetiva e os resultados. A qualidade intrínseca das notificações e a usabilidade ainda exigem avaliações específicas.

## Licença e fontes

Código original sob [licença MIT](LICENSE). Dados, publicações e recursos de terceiros mantêm seus termos; consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

# Reprodução científica — ERAMIA-RS 2026

## 1. Contagens sobre a base corrente

Com a configuração descrita no README principal:

```sh
npm run validate:science
```

A execução usa consultas somente leitura e escreve `research/local/scientific-validation-results.json`. Um caminho alternativo pode ser passado após `--`. Os estudos são Sardinha et al. (2026), Soares et al. (2025) e Rezende et al. (2026); seus identificadores e protocolos estão em `src/lib/scientific-validation.ts` e `src/lib/eramia-2026.ts`.

O script compara contagens, denominadores e proporções; **não valida os modelos ajustados**. Os limiares de 1% e 3% são critérios descritivos de comparação, não testes de equivalência ou intervalos de confiança. A API `/api/validacao` fornece a comparação dos modelos na carga atual; `/api/artigo/eramia-2026` separa os números usados no artigo dos valores atuais.

## 2. Mesmo motor, arquivo original de Rezende

Fonte pública: https://github.com/JoaoFelipe/COVID-Study

Baixe o arquivo `SRAG 2024_DOWNLOAD 29_3_25 IMUNODEPRE_RT_PCR OU ANTIGENO POSITIVO.xlsx` desse repositório e salve em `research/local/rezende-original.xlsx`. A referência da análise está em `analysis.Rmd` e https://joaofelipe.github.io/COVID-Study/analysis.html.

SHA-256 esperado:

```text
721c8c40212b9f11c1b211f2fde89de73f896765f65ed16a44bfec8e6366bf6d
```

Instale as dependências Python indicadas em `etl-python/requirements.txt` (incluem pandas e openpyxl). Execute a partir da raiz:

```sh
python research/extract_rezende_design_matrix.py research/local/rezende-original.xlsx research/local/rezende-matrix.json
npm run validate:engine -- research/local/rezende-matrix.json research/local/rezende-engine.json
```

O extrator verifica o hash, colunas, recodificações e a coorte esperada de 474 registros, 171 óbitos e 303 sobreviventes. O teste executa `fitLogistic`, o mesmo núcleo usado pela plataforma, e compara 12 coeficientes e erros-padrão com o `glm` dos autores. Falha se não convergir ou ultrapassar a tolerância de 0,000005, adotada como tolerância numérica; a coincidência a seis casas exige também examinar as diferenças observadas.

Na [reexecução de 5 de outubro de 2026](../public/artifacts/eramia-2026/rezende-engine-2026-10-05.json), houve convergência em 6 iterações; diferenças máximas de aproximadamente 4,99e-7 nos coeficientes e 3,68e-7 nos erros-padrão. A tolerância do teste é mais ampla que meia unidade na sexta casa; as diferenças efetivamente observadas ficaram abaixo de 5e-7.

Este teste controla arquivo, seleção e codificação. Não demonstra que uma análise livre feita com outro conjunto de dados será equivalente, nem certifica uma conclusão clínica.

## 3. Evidência de ponta a ponta

Com o servidor local em modo somente leitura:

```sh
npm run test:live
```

Os resultados completos das APIs e comparações ficam em `research/local/`. Guarde os manifestos originais, a data de execução e o commit do código junto com qualquer evidência usada no artigo. O botão **JSON + manifesto** também permite obter um resultado e reexecutá-lo com `npm run replay:analysis`.

Não confundir: arquivos originais de estudos, dados normalizados da plataforma e saídas agregadas exportadas. A plataforma atualmente exporta resultados agregados e configuração; não oferece download geral de registros individuais preparados.

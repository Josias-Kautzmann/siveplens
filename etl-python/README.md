# Preparação e carga dos dados

O ETL obtém arquivos anuais do SIVEP-Gripe, normaliza os campos usados pela
plataforma e carrega o PostgreSQL. Os scripts escrevem no banco configurado;
use uma base própria para reproduzir a preparação localmente.

## Instalação

Requisitos: Python 3.12+, PostgreSQL e dependências de `requirements.txt`.

```sh
python -m venv .venv
python -m pip install -r etl-python/requirements.txt
```

Ative o ambiente virtual antes da instalação. Copie `etl-python/.env.example`
para `etl-python/.env` e configure `DATABASE_URL` e os caminhos dos insumos.
Este arquivo é separado do `.env.local` da aplicação web.

## Insumos e esquema

1. Obtenha o CSV anual no [Portal de Dados Abertos do SUS](https://dadosabertos.saude.gov.br/dataset/srag-2019-a-2026), junto com o dicionário de dados. Preserve a URL, a data e o arquivo utilizado.
2. Crie as tabelas a partir de `src/db/schema.ts`, conforme o README principal.
3. A carga também utiliza a rotina PostgreSQL `refresh_semana_mun()`, definida em `drizzle/neon_setup.sql`. A sincronização do esquema pelo Drizzle não instala essa rotina.
4. Para os mapas, preencha `dim_municipio` com `seed_dim_municipio.py`. Configure `CCMEC_CSV` para a tabela de municípios e hierarquia regional obtida no DATASUS e `MUN_NAMES_JSON` para o lookup incluído no projeto. O script exige as colunas listadas em seu `usecols`.

Execute os comandos abaixo a partir da raiz do repositório.

## Carga de um arquivo escolhido

```sh
python etl-python/seed_dim_municipio.py
python etl-python/load_influd.py /caminho/absoluto/INFLUD24.csv
```

`load_influd.py` importa o arquivo indicado e atualiza notificações existentes
por identificador. `normalization.py` centraliza conversões e regras comuns,
incluindo idade/unidade, datas e resultados laboratoriais ausentes. Os testes
documentam casos de normalização e o alinhamento dos campos entre os loaders.
O carregador registra a identidade do arquivo em `manifesto_fonte`.

## Atualização automatizada

```sh
python etl-python/update_csv.py --dry-run
python etl-python/update_csv.py
```

O primeiro comando inspeciona as fontes sem persistir a carga. A execução
normal substitui o conteúdo de `fato_caso_srag` com os arquivos selecionados
pelo carregador e atualiza as agregações. Não a execute em uma base com dados
adicionais que devam ser preservados. Consulte os anos e as regras de seleção
em `update_csv.py` antes de ativar o agendamento.

Os workflows de ETL usam o segredo `DATABASE_URL` e só executam com a variável
de repositório `ENABLE_ETL=true`. Não é necessário habilitá-los para usar a
aplicação com um banco já carregado.

## Verificação e reprodução

```sh
python -m unittest discover -s etl-python/tests -v
```

O teste controlado de regressão usa uma planilha preparada por autores externos,
não o CSV bruto nem a base normalizada da plataforma. Consulte
[o protocolo de reprodução](../research/README.md). As exportações da interface
contêm resultados agregados e manifestos; não fornecem uma cópia dos microdados.

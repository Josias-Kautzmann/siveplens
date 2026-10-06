# Fontes e materiais de terceiros

A licença MIT cobre o código original do SivepLens. Dados, publicações,
dependências e recursos visuais de terceiros mantêm seus próprios direitos e
condições de uso; a licença do projeto não os relicencia.

- **SIVEP-Gripe:** Ministério da Saúde, [Portal de Dados Abertos do SUS](https://dadosabertos.saude.gov.br/dataset/srag-2019-a-2026). Os microdados não são distribuídos neste repositório. Os scripts documentam obtenção, normalização e identificação dos arquivos.
- **Geografia:** malhas municipais obtidas da [API do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3), simplificadas em TopoJSON. O processamento está em `src/etl/scripts/download-municipios.mjs`.
- **Estudo de Rezende:** dados e análise de referência em [JoaoFelipe/COVID-Study](https://github.com/JoaoFelipe/COVID-Study). O roteiro em `research/README.md` indica o arquivo externo e seu hash; o XLSX não integra este repositório.
- **Retratos de pesquisadores:** recursos em `public/researchers/`, associados aos autores identificados em `src/services/researcherPhotos.ts`. Não estão abrangidos pela licença MIT do código.
- **Dependências:** bibliotecas JavaScript e Python mantêm as licenças de seus respectivos autores. As versões JavaScript resolvidas estão nos arquivos `package-lock.json`.

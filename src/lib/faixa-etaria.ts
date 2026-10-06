/**
 * Expressão CASE SQL que deriva a faixa etária a partir de tp_idade + nu_idade_n.
 * Compartilhada entre o DAL (pirâmide etária) e a API de regressão logística.
 *
 * tp_idade: 1 = Dias, 2 = Meses, 3 = Anos
 */
export const FAIXA_CASE = `
  CASE
    WHEN tp_idade IN (1, 2) THEN '0-4'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 0  AND 4  THEN '0-4'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 5  AND 11 THEN '5-11'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 12 AND 17 THEN '12-17'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 18 AND 29 THEN '18-29'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 30 AND 39 THEN '30-39'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 40 AND 49 THEN '40-49'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 50 AND 59 THEN '50-59'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 60 AND 69 THEN '60-69'
    WHEN tp_idade = 3 AND nu_idade_n BETWEEN 70 AND 79 THEN '70-79'
    WHEN tp_idade = 3 AND nu_idade_n >= 80            THEN '80+'
  END
` as const;

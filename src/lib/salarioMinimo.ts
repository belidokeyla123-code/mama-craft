// Histórico oficial do salário mínimo no Brasil
export const SALARIO_MINIMO_HISTORICO: Record<number, number> = {
  2010: 510.00,
  2011: 545.00,
  2012: 622.00,
  2013: 678.00,
  2014: 724.00,
  2015: 788.00,
  2016: 880.00,
  2017: 937.00,
  2018: 954.00,
  2019: 998.00,
  2020: 1045.00,
  2021: 1100.00,
  2022: 1212.00,
  2023: 1320.00,
  2024: 1412.00,
  2025: 1518.00,
};

/**
 * Retorna o salário mínimo para um ano específico
 */
export function getSalarioMinimoByYear(year: number): number {
  return SALARIO_MINIMO_HISTORICO[year] || 1412.00;
}

/**
 * Gera o histórico de salário mínimo entre dois anos
 */
export function getSalarioMinimoHistory(startYear: number, endYear: number = new Date().getFullYear()) {
  const history = [];
  for (let year = startYear; year <= endYear; year++) {
    history.push({
      year,
      value: getSalarioMinimoByYear(year)
    });
  }
  return history;
}

/**
 * Calcula o salário mínimo vigente para uma data específica
 */
export function getSalarioMinimoByDate(date: Date | string): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const year = dateObj.getFullYear();
  return getSalarioMinimoByYear(year);
}

/**
 * Calcula o valor da causa baseado no salário-maternidade (4 meses)
 */
export function calculateValorCausa(salarioMinimo: number): number {
  return salarioMinimo * 4;
}

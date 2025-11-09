import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Scale, Handshake, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "./StatCard";
import AIInsights from "./AIInsights";
import SuccessPatternAnalysis from "./SuccessPatternAnalysis";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FinancialStats {
  total_protocoladas: number;
  total_acordos: number;
  total_sentencas_procedentes: number;
  total_sentencas_improcedentes: number;
  valor_total_recebido: number;
  valor_total_cliente: number;
  valor_total_honorarios: number;
}

const PIE_COLORS = ['#8b5cf6', '#10b981', '#ef4444'];

export default function FinancialDashboard() {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes' | 'ano'>('mes');
  const [stats, setStats] = useState<FinancialStats>({
    total_protocoladas: 0,
    total_acordos: 0,
    total_sentencas_procedentes: 0,
    total_sentencas_improcedentes: 0,
    valor_total_recebido: 0,
    valor_total_cliente: 0,
    valor_total_honorarios: 0,
  });
  const [previousStats, setPreviousStats] = useState<FinancialStats | null>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [honorariosPrevistos, setHonorariosPrevistos] = useState(0);

  useEffect(() => {
    loadStats();
    loadMonthlyTrend();
    loadHonorariosPrevistos();
  }, [periodo]);
  
  const loadHonorariosPrevistos = async () => {
    try {
      const { data: cases } = await supabase
        .from('cases')
        .select('contract_value')
        .not('contract_value', 'is', null);
      
      const total = cases?.reduce((sum, c) => sum + (c.contract_value || 0), 0) || 0;
      setHonorariosPrevistos(total);
    } catch (error) {
      console.error('Erro ao carregar honorários previstos:', error);
    }
  };

  const getPeriodoDates = () => {
    const now = new Date();
    switch (periodo) {
      case 'dia':
        return { inicio: startOfDay(now), fim: endOfDay(now) };
      case 'semana':
        return { inicio: startOfWeek(now, { locale: ptBR }), fim: endOfWeek(now, { locale: ptBR }) };
      case 'mes':
        return { inicio: startOfMonth(now), fim: endOfMonth(now) };
      case 'ano':
        return { inicio: startOfYear(now), fim: endOfYear(now) };
    }
  };

  const getPreviousPeriodoDates = () => {
    const now = new Date();
    switch (periodo) {
      case 'dia':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return { inicio: startOfDay(yesterday), fim: endOfDay(yesterday) };
      case 'semana':
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return { inicio: startOfWeek(lastWeek, { locale: ptBR }), fim: endOfWeek(lastWeek, { locale: ptBR }) };
      case 'mes':
        const lastMonth = subMonths(now, 1);
        return { inicio: startOfMonth(lastMonth), fim: endOfMonth(lastMonth) };
      case 'ano':
        const lastYear = new Date(now);
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        return { inicio: startOfYear(lastYear), fim: endOfYear(lastYear) };
    }
  };

  const loadStats = async () => {
    const { inicio, fim } = getPeriodoDates();
    const { inicio: prevInicio, fim: prevFim } = getPreviousPeriodoDates();

    try {
      // Stats do período atual
      const { data: financial } = await supabase
        .from('case_financial')
        .select('*')
        .gte('data_recebimento', inicio.toISOString().split('T')[0])
        .lte('data_recebimento', fim.toISOString().split('T')[0]);

      const currentStats = calculateStats(financial || []);
      setStats(currentStats);

      // Stats do período anterior
      const { data: prevFinancial } = await supabase
        .from('case_financial')
        .select('*')
        .gte('data_recebimento', prevInicio.toISOString().split('T')[0])
        .lte('data_recebimento', prevFim.toISOString().split('T')[0]);

      setPreviousStats(calculateStats(prevFinancial || []));
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  };

  const calculateStats = (data: any[]): FinancialStats => {
    return {
      total_protocoladas: data.length,
      total_acordos: data.filter(d => d.tipo_conclusao === 'acordo').length,
      total_sentencas_procedentes: data.filter(d => d.tipo_conclusao === 'sentenca_procedente').length,
      total_sentencas_improcedentes: data.filter(d => d.tipo_conclusao === 'sentenca_improcedente').length,
      valor_total_recebido: data.reduce((sum, d) => sum + (d.valor_recebido || 0), 0),
      valor_total_cliente: data.reduce((sum, d) => sum + (d.valor_cliente || 0), 0),
      valor_total_honorarios: data.reduce((sum, d) => sum + (d.valor_honorarios || 0), 0),
    };
  };

  const loadMonthlyTrend = async () => {
    try {
      const months = [];
      const now = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(now, i);
        const inicio = startOfMonth(month);
        const fim = endOfMonth(month);

        const { data } = await supabase
          .from('case_financial')
          .select('*')
          .gte('data_recebimento', inicio.toISOString().split('T')[0])
          .lte('data_recebimento', fim.toISOString().split('T')[0]);

        const monthStats = calculateStats(data || []);
        
        months.push({
          mes: format(month, 'MMM', { locale: ptBR }),
          honorarios: monthStats.valor_total_honorarios,
          protocoladas: monthStats.total_protocoladas,
        });
      }

      setMonthlyData(months);
    } catch (error) {
      console.error('Erro ao carregar tendência mensal:', error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const calculateVariation = () => {
    if (!previousStats || previousStats.valor_total_honorarios === 0) return { percent: 0, positive: true };
    
    const variation = ((stats.valor_total_honorarios - previousStats.valor_total_honorarios) / previousStats.valor_total_honorarios) * 100;
    return { percent: Math.abs(variation), positive: variation >= 0 };
  };

  const variation = calculateVariation();

  const pieData = [
    { name: 'Acordos', value: stats.total_acordos },
    { name: 'Sentenças Procedentes', value: stats.total_sentencas_procedentes },
    { name: 'Derrotas', value: stats.total_sentencas_improcedentes },
  ];

  const getReportMessage = () => {
    if (variation.positive && variation.percent >= 10) {
      return {
        title: `${periodo === 'mes' ? 'Mês' : 'Período'} Excelente! 🎉`,
        description: `Aumento de ${variation.percent.toFixed(1)}% nos honorários em relação ao período anterior. Você protocolou ${stats.total_protocoladas} casos, com ${stats.total_acordos} acordos e ${stats.total_sentencas_procedentes} sentenças procedentes. Continue assim!`,
        type: 'success' as const,
      };
    } else if (!variation.positive && variation.percent >= 10) {
      return {
        title: 'Atenção! 📉',
        description: `Queda de ${variation.percent.toFixed(1)}% em relação ao período anterior. Considere revisar estratégias e aumentar captação de casos.`,
        type: 'warning' as const,
      };
    } else {
      return {
        title: 'Período Estável',
        description: `Variação de ${variation.positive ? '+' : '-'}${variation.percent.toFixed(1)}%. Mantenha o bom trabalho e foque em melhorar continuamente.`,
        type: 'info' as const,
      };
    }
  };

  const report = getReportMessage();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard Financeiro</h2>
      </div>

      <Tabs value={periodo} onValueChange={(value: any) => setPeriodo(value)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dia">Dia</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="ano">Ano</TabsTrigger>
        </TabsList>

        <TabsContent value={periodo} className="space-y-6">
          {/* Cards de Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Protocoladas" value={stats.total_protocoladas} icon={Scale} color="blue" />
            <StatCard label="Acordos" value={stats.total_acordos} icon={Handshake} color="purple" />
            <StatCard label="Sentenças Procedentes" value={stats.total_sentencas_procedentes} icon={CheckCircle2} color="green" />
            <StatCard label="Derrotas" value={stats.total_sentencas_improcedentes} icon={XCircle} color="red" />
          </div>

          {/* Card de Honorários Previstos vs Recebidos */}
          <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-2 border-blue-500/20">
            <h3 className="text-lg font-semibold mb-4">💰 Honorários - Contratos vs Recebidos</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Previstos (Contratos)</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(honorariosPrevistos)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total de todos os contratos</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Recebidos (Período)</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(stats.valor_total_honorarios)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Já recebido neste período</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">A Receber</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(Math.max(0, honorariosPrevistos - stats.valor_total_honorarios))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Saldo pendente</p>
              </div>
            </div>
          </Card>
          
          {/* Card de Valores */}
          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-500/20">
            <h3 className="text-lg font-semibold mb-4">Financeiro do Período</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Recebido</p>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency(stats.valor_total_recebido)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Cliente</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(stats.valor_total_cliente)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Seus Honorários</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(stats.valor_total_honorarios)}
                </p>
              </div>
            </div>
          </Card>

          {/* Gráfico de Evolução */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Evolução Mensal</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="honorarios" fill="#10b981" name="Honorários" />
                <Bar dataKey="protocoladas" fill="#3b82f6" name="Protocoladas" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Comparativo */}
          {previousStats && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Comparativo</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Período Anterior</span>
                  <span className="font-bold">{formatCurrency(previousStats.valor_total_honorarios)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Período Atual</span>
                  <span className="font-bold">{formatCurrency(stats.valor_total_honorarios)}</span>
                </div>
                <Separator />
                <div className={`flex items-center justify-between ${variation.positive ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="font-semibold">Variação</span>
                  <span className="text-xl font-bold flex items-center gap-1">
                    {variation.positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {variation.positive ? '+' : '-'}{variation.percent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Relatório Automático */}
          <Alert className={`${variation.positive ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'}`}>
            {variation.positive ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-orange-600" />
            )}
            <AlertTitle className={variation.positive ? 'text-green-900' : 'text-orange-900'}>
              {report.title}
            </AlertTitle>
            <AlertDescription className={variation.positive ? 'text-green-800' : 'text-orange-800'}>
              {report.description}
            </AlertDescription>
          </Alert>

          {/* Gráfico de Pizza */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Distribuição de Resultados</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Separator className="my-8" />

          {/* Insights com IA */}
          <AIInsights 
            currentStats={stats}
            previousStats={previousStats || stats}
            monthlyData={monthlyData}
          />

          <Separator className="my-8" />

          {/* Análise de Padrões de Sucesso */}
          <SuccessPatternAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
}

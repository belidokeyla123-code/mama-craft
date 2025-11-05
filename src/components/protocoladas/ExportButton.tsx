import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Table } from "lucide-react";
import { toast } from "sonner";

interface ExportButtonProps {
  data: any[];
  filename?: string;
}

export default function ExportButton({ data, filename = "relatorio" }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    setIsExporting(true);
    try {
      // Cabeçalhos
      const headers = ["Nome", "CPF", "Status", "Data Evento", "Valor Causa", "Honorários", "Data Protocolo"];
      
      // Linhas de dados
      const rows = data.map(item => [
        item.author_name || "",
        item.author_cpf || "",
        item.status || "",
        item.event_date ? new Date(item.event_date).toLocaleDateString('pt-BR') : "",
        item.valor_causa ? `R$ ${item.valor_causa.toFixed(2)}` : "",
        item.valor_honorarios ? `R$ ${item.valor_honorarios.toFixed(2)}` : "",
        item.data_protocolo ? new Date(item.data_protocolo).toLocaleDateString('pt-BR') : "",
      ]);

      // Criar CSV
      const csvContent = [
        headers.join(";"),
        ...rows.map(row => row.join(";"))
      ].join("\n");

      // Download
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast.success("Relatório exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar relatório");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    toast.info("Exportação para PDF em desenvolvimento...");
    // TODO: Implementar exportação PDF usando jsPDF ou similar
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={isExporting}>
          <Download className="h-4 w-4" />
          {isExporting ? "Exportando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={exportToCSV} className="gap-2">
          <Table className="h-4 w-4" />
          Exportar para Excel (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF} className="gap-2">
          <FileText className="h-4 w-4" />
          Exportar para PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

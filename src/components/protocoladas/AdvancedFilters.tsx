import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, X } from "lucide-react";

interface AdvancedFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
}

export interface FilterValues {
  searchTerm: string;
  status: string;
  minValue: string;
  maxValue: string;
  dateFrom: string;
  dateTo: string;
}

export default function AdvancedFilters({ onFilterChange }: AdvancedFiltersProps) {
  const [filters, setFilters] = useState<FilterValues>({
    searchTerm: "",
    status: "all",
    minValue: "",
    maxValue: "",
    dateFrom: "",
    dateTo: "",
  });

  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterValues = {
      searchTerm: "",
      status: "all",
      minValue: "",
      maxValue: "",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  return (
    <Card className="p-4 mb-6">
      {/* Busca Rápida */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CPF..."
            value={filters.searchTerm}
            onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros Avançados
        </Button>
        {(filters.status !== "all" || filters.minValue || filters.maxValue || filters.dateFrom || filters.dateTo) && (
          <Button variant="ghost" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>

      {/* Filtros Avançados */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
          <div>
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="protocolada">Protocolada</SelectItem>
                <SelectItem value="em_audiencia">Em Audiência</SelectItem>
                <SelectItem value="acordo">Acordo</SelectItem>
                <SelectItem value="sentenca">Sentença</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Valor Mínimo (R$)</Label>
            <Input
              type="number"
              placeholder="0,00"
              value={filters.minValue}
              onChange={(e) => handleFilterChange("minValue", e.target.value)}
            />
          </div>

          <div>
            <Label>Valor Máximo (R$)</Label>
            <Input
              type="number"
              placeholder="0,00"
              value={filters.maxValue}
              onChange={(e) => handleFilterChange("maxValue", e.target.value)}
            />
          </div>

          <div>
            <Label>Data Inicial</Label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            />
          </div>

          <div>
            <Label>Data Final</Label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

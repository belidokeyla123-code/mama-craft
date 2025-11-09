import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Circle } from "lucide-react";
import { VALIDATION_CHECKLIST, getCategoryLabel, DocumentChecklistItem } from "@/config/validation-checklist";

interface ValidationChecklistVisualProps {
  uploadedDocuments?: Array<{ document_type: string; file_name: string }>;
}

export const ValidationChecklistVisual = ({ uploadedDocuments = [] }: ValidationChecklistVisualProps) => {
  // Agrupar checklist por categoria
  const categories = [
    'imprescindivel',
    'pessoal',
    'complementar',
    'extras',
    'tecnico_interno'
  ];

  // Normalizar tipos de documentos enviados
  const normalizeDocType = (type: string): string => {
    return type.toLowerCase().trim().replace(/[_\s-]/g, '_');
  };

  const uploadedTypes = uploadedDocuments.map(d => normalizeDocType(d.document_type));

  // Verificar se um item do checklist foi enviado
  const isItemUploaded = (item: DocumentChecklistItem): boolean => {
    const itemId = normalizeDocType(item.id);
    return uploadedTypes.some(type => {
      // Match exato
      if (type === itemId) return true;
      // Match parcial (ex: "rg" em "rg_cpf_mae")
      if (itemId.includes(type) || type.includes(itemId)) return true;
      return false;
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold mb-2 text-blue-900">
          📋 Checklist Master - Ação de Auxílio-Maternidade Rural
        </h3>
        <p className="text-sm text-blue-700">
          Este checklist mostra todos os documentos recomendados. Os marcados em verde foram detectados automaticamente.
        </p>
      </Card>

      {categories.map(category => {
        const items = VALIDATION_CHECKLIST.filter(item => item.category === category);
        if (items.length === 0) return null;

        const uploadedCount = items.filter(item => isItemUploaded(item)).length;
        const requiredCount = items.filter(item => item.required).length;

        return (
          <Card key={category} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-md font-semibold">{getCategoryLabel(category)}</h4>
              <Badge variant={uploadedCount > 0 ? "default" : "secondary"}>
                {uploadedCount}/{items.length} enviados
              </Badge>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                const isUploaded = isItemUploaded(item);
                const isRequired = item.required;

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      isUploaded
                        ? 'bg-green-50 border-green-200'
                        : isRequired
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isUploaded ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : isRequired ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-400" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium ${
                          isUploaded ? 'text-green-900' : isRequired ? 'text-red-900' : 'text-gray-700'
                        }`}>
                          {item.label}
                        </span>
                        {isRequired && !isUploaded && (
                          <Badge variant="destructive" className="text-xs">
                            OBRIGATÓRIO
                          </Badge>
                        )}
                        {isUploaded && (
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                            ✓ Enviado
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-600">{item.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <Card className="p-6 bg-amber-50 border-amber-200">
        <h4 className="font-semibold mb-2 text-amber-900">💡 Dica Importante</h4>
        <p className="text-sm text-amber-800">
          Quanto mais documentos complementares você enviar, maior a chance de sucesso da ação! 
          Os documentos marcados como "OBRIGATÓRIO" bloqueiam o avanço se não forem enviados.
        </p>
      </Card>
    </div>
  );
};

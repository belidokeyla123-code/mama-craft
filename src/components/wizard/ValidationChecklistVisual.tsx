import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Circle, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { VALIDATION_CHECKLIST, getCategoryLabel, DocumentChecklistItem } from "@/config/validation-checklist";

interface ValidationChecklistVisualProps {
  uploadedDocuments?: Array<{ document_type: string; file_name: string }>;
  caseId?: string;
  onDocumentAdded?: () => void;
  technicalAnalysis?: {
    atividade_10_meses?: { status: string; details: string };
    prova_material?: { status: string; details: string };
  };
}

export const ValidationChecklistVisual = ({ 
  uploadedDocuments = [],
  caseId,
  onDocumentAdded,
  technicalAnalysis 
}: ValidationChecklistVisualProps) => {
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, item: DocumentChecklistItem) => {
    const file = e.target.files?.[0];
    if (!file || !caseId) return;

    setUploadingItemId(item.id);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );

      // Upload para o storage
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = `case_${caseId}/${timestamp}_${randomId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('case-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Inserir documento na tabela
      const { error: docError } = await supabase
        .from('documents')
        .insert({
          case_id: caseId,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
          document_type: item.id,
        });

      if (docError) throw docError;

      // Notificar componente pai para re-validar
      if (onDocumentAdded) {
        onDocumentAdded();
      }

      // Limpar input
      if (fileInputRefs.current[item.id]) {
        fileInputRefs.current[item.id]!.value = '';
      }
    } catch (error) {
      console.error('[UPLOAD INLINE] Erro:', error);
      alert('Erro ao enviar documento. Tente novamente.');
    } finally {
      setUploadingItemId(null);
    }
  };
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

                // Verificar se tem análise técnica automática para este item
                const technicalStatus = 
                  item.id === 'atividade_10_meses' ? technicalAnalysis?.atividade_10_meses :
                  item.id === 'prova_material' ? technicalAnalysis?.prova_material :
                  null;

                const hasAutoAnalysis = !!technicalStatus;
                const autoStatus = technicalStatus?.status || 'missing';
                const autoOk = autoStatus === 'ok';

                // Para itens com análise automática, usar o status da IA
                const finalStatus = hasAutoAnalysis ? autoOk : isUploaded;

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      finalStatus
                        ? 'bg-green-50 border-green-200'
                        : isRequired
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {finalStatus ? (
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
                        {finalStatus && hasAutoAnalysis && (
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                            ✓ Verificado por IA
                          </Badge>
                        )}
                        {isUploaded && !hasAutoAnalysis && (
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                            ✓ Enviado
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-600">{item.description}</p>
                      )}
                      
                      {/* Exibir análise técnica automática */}
                      {hasAutoAnalysis && technicalStatus && (
                        <div className={`mt-2 p-2 rounded text-xs ${
                          autoOk ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          <strong>🧠 Análise Automática da IA:</strong>
                          <p className="mt-1">{technicalStatus.details}</p>
                        </div>
                      )}
                    </div>

                    {/* Botão de Upload Inline (oculto para itens com análise automática) */}
                    {!hasAutoAnalysis && (
                      <div className="flex-shrink-0">
                        <input
                          ref={el => fileInputRefs.current[item.id] = el}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, item)}
                        />
                        <Button
                          size="sm"
                          variant={isUploaded ? "outline" : "default"}
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          disabled={uploadingItemId === item.id || !caseId}
                          className="gap-2"
                        >
                          {uploadingItemId === item.id ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              {isUploaded ? 'Adicionar Outro' : 'Adicionar'}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
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

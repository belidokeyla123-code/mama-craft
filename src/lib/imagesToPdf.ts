import { jsPDF } from 'jspdf';

/**
 * Reconverte múltiplas imagens PNG em um único PDF
 * @param images - Array de blobs de imagem
 * @param originalName - Nome original do documento
 * @returns Blob do PDF gerado
 */
export async function reconvertImagesToPDF(
  images: Blob[],
  originalName: string
): Promise<Blob> {
  console.log(`[IMG→PDF] Reconvertendo ${images.length} imagens para ${originalName}.pdf`);
  
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    for (let i = 0; i < images.length; i++) {
      console.log(`[IMG→PDF] Processando imagem ${i + 1}/${images.length}...`);
      
      // Criar URL temporária da imagem
      const imgUrl = URL.createObjectURL(images[i]);
      
      try {
        // Adicionar nova página (exceto na primeira)
        if (i > 0) {
          pdf.addPage();
        }
        
        // Adicionar imagem ocupando toda a página A4
        // Dimensões A4: 210mm x 297mm
        pdf.addImage(imgUrl, 'PNG', 0, 0, 210, 297);
        
      } finally {
        // Liberar URL temporária
        URL.revokeObjectURL(imgUrl);
      }
    }

    console.log(`[IMG→PDF] ✅ PDF gerado com sucesso (${images.length} páginas)`);
    
    // Retornar como Blob
    return pdf.output('blob');
    
  } catch (error) {
    console.error('[IMG→PDF] Erro ao reconverter para PDF:', error);
    throw new Error(`Falha ao reconverter imagens para PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Agrupa documentos por nome original (antes de _pagina_X)
 * @param documents - Array de documentos
 * @returns Objeto agrupado por nome original
 */
export function groupDocumentsByOriginalName(documents: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  
  for (const doc of documents) {
    // Tentar extrair nome original antes de "_pagina_X"
    const match = doc.file_name.match(/^(.+?)_pagina_(\d+)\.(png|jpg|jpeg)$/i);
    
    if (match) {
      const [_, originalName, pageNumStr] = match;
      const pageNum = parseInt(pageNumStr);
      
      if (!groups[originalName]) {
        groups[originalName] = [];
      }
      groups[originalName].push({ ...doc, pageNum, originalName });
      
    } else {
      // Documento individual (não é página de PDF)
      groups[doc.file_name] = [doc];
    }
  }
  
  return groups;
}

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configurar o worker do PDF.js para Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PDFConversionResult {
  images: File[];
  originalFileName: string;
}

/**
 * Converte um arquivo PDF em múltiplas imagens (uma por página)
 * @param file - Arquivo PDF para converter
 * @param maxPages - Número máximo de páginas a converter (padrão: 10)
 * @returns Array de arquivos de imagem (PNG)
 */
export async function convertPDFToImages(
  file: File,
  maxPages: number = 10
): Promise<PDFConversionResult> {
  console.log(`[PDF→IMG] Iniciando conversão de: ${file.name}`);
  
  try {
    // Carregar o PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const totalPages = Math.min(pdf.numPages, maxPages);
    console.log(`[PDF→IMG] Total de páginas a converter: ${totalPages}/${pdf.numPages}`);
    
    const images: File[] = [];
    
    // Converter cada página em imagem
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // Configurar escala para qualidade adequada (1.5x para boa qualidade)
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      
      // Criar canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Não foi possível obter contexto 2D do canvas');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Renderizar página no canvas
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise;
      
      // Converter canvas para Blob PNG
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) throw new Error('Falha ao converter canvas para blob');
          resolve(blob);
        }, 'image/png', 0.95);
      });
      
      // Criar arquivo de imagem
      const originalName = file.name.replace(/\.pdf$/i, '');
      const imageFile = new File(
        [blob],
        `${originalName}_pagina_${pageNum}.png`,
        { type: 'image/png' }
      );
      
      images.push(imageFile);
      console.log(`[PDF→IMG] Página ${pageNum}/${totalPages} convertida (${(blob.size / 1024).toFixed(1)} KB)`);
    }
    
    console.log(`[PDF→IMG] ✓ Conversão concluída: ${images.length} imagens geradas`);
    
    return {
      images,
      originalFileName: file.name,
    };
    
  } catch (error) {
    console.error('[PDF→IMG] Erro na conversão:', error);
    throw new Error(`Falha ao converter PDF "${file.name}": ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Verifica se um arquivo é um PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js para Vite - método correto para bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

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
  console.log(`[PDF→IMG] Iniciando conversão de: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  console.log(`[PDF→IMG] Worker configurado: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
  
  try {
    // Carregar o PDF
    console.log(`[PDF→IMG] Lendo arquivo como ArrayBuffer...`);
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[PDF→IMG] ArrayBuffer carregado: ${arrayBuffer.byteLength} bytes`);
    
    console.log(`[PDF→IMG] Carregando documento PDF...`);
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    console.log(`[PDF→IMG] PDF carregado com sucesso`);
    
    const totalPages = Math.min(pdf.numPages, maxPages);
    console.log(`[PDF→IMG] Total de páginas a converter: ${totalPages}/${pdf.numPages}`);
    
    const images: File[] = [];
    
    // Converter cada página em imagem
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`[PDF→IMG] Processando página ${pageNum}/${totalPages}...`);
      const page = await pdf.getPage(pageNum);
      
      // Configurar escala para qualidade adequada (1.5x para boa qualidade)
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      console.log(`[PDF→IMG] Viewport: ${viewport.width}x${viewport.height}`);
      
      // Criar canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Não foi possível obter contexto 2D do canvas');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Renderizar página no canvas
      console.log(`[PDF→IMG] Renderizando página ${pageNum}...`);
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise;
      console.log(`[PDF→IMG] Página ${pageNum} renderizada com sucesso`);
      
      // Converter canvas para Blob PNG
      console.log(`[PDF→IMG] Convertendo para PNG...`);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Falha ao converter canvas para blob'));
            return;
          }
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
    console.error('[PDF→IMG] Erro detalhado:', error);
    console.error('[PDF→IMG] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    console.error('[PDF→IMG] Tipo do erro:', error instanceof Error ? error.constructor.name : typeof error);
    throw new Error(`Falha ao converter PDF "${file.name}": ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Verifica se um arquivo é um PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

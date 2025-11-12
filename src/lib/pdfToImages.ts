import * as pdfjsLib from 'pdfjs-dist';

// ✅ CORREÇÃO #1: Usar worker local ao invés de CDN externo
// O Vite copia o worker para /assets/ durante o build (veja vite.config.ts)
// Em desenvolvimento, usamos o worker do node_modules
// Em produção, usamos o worker copiado para /assets/

if (import.meta.env.DEV) {
  // Desenvolvimento: usar worker do node_modules
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
  console.log('[PDF.js] Modo DEV - Worker do node_modules');
} else {
  // Produção: usar worker copiado para /assets/
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.mjs';
  console.log('[PDF.js] Modo PROD - Worker de /assets/');
}

console.log('[PDF.js] Worker configurado:', pdfjsLib.GlobalWorkerOptions.workerSrc);

export interface PDFConversionResult {
  images: File[];
  originalFileName: string;
}

/**
 * Converte um arquivo PDF em múltiplas imagens (uma por página)
 * @param file - Arquivo PDF para converter
 * @param maxPages - Número máximo de páginas a converter (padrão: 10)
 * @param onProgress - Callback opcional para reportar progresso (página atual, total)
 * @returns Array de arquivos de imagem (PNG)
 */
export async function convertPDFToImages(
  file: File,
  maxPages: number = 10,
  onProgress?: (current: number, total: number) => void
): Promise<PDFConversionResult> {
  console.log(`[PDF→IMG] Iniciando conversão de: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  
  try {
    // ✅ CORREÇÃO #4: Validar tipo MIME antes de processar
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Arquivo não é um PDF válido. Por favor, selecione um arquivo .pdf');
    }
    
    // ✅ CORREÇÃO #4: Validar tamanho (máximo 50MB para evitar travamento)
    const maxSizeMB = 50;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error(`PDF muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo permitido: ${maxSizeMB}MB`);
    }
    
    // Carregar o PDF
    console.log(`[PDF→IMG] Lendo arquivo como ArrayBuffer...`);
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[PDF→IMG] ArrayBuffer carregado: ${arrayBuffer.byteLength} bytes`);
    
    // ✅ CORREÇÃO #4: Validar magic number (primeiros bytes do PDF)
    const bytes = new Uint8Array(arrayBuffer);
    const header = String.fromCharCode(...bytes.slice(0, 4));
    
    if (header !== '%PDF') {
      throw new Error('Arquivo corrompido ou não é um PDF válido. Verifique o arquivo e tente novamente.');
    }
    
    console.log(`[PDF→IMG] Carregando documento PDF...`);
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    console.log(`[PDF→IMG] PDF carregado com sucesso`);
    
    const totalPages = Math.min(pdf.numPages, maxPages);
    console.log(`[PDF→IMG] Total de páginas a converter: ${totalPages}/${pdf.numPages}`);
    
    if (pdf.numPages > maxPages) {
      console.warn(`[PDF→IMG] ⚠️ PDF tem ${pdf.numPages} páginas, mas apenas ${maxPages} serão convertidas`);
    }
    
    const images: File[] = [];
    
    // Converter cada página em imagem
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`[PDF→IMG] Processando página ${pageNum}/${totalPages}...`);
      
      // ✅ CORREÇÃO #5: Reportar progresso para o usuário
      if (onProgress) {
        onProgress(pageNum, totalPages);
      }
      
      const page = await pdf.getPage(pageNum);
      
      // Configurar escala otimizada (1.5x balanceia qualidade OCR com tamanho do arquivo)
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      console.log(`[PDF→IMG] Viewport: ${viewport.width}x${viewport.height}`);
      
      // Criar canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Não foi possível obter contexto 2D do canvas. Seu navegador pode não suportar esta operação.');
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
      
      // Converter canvas para Blob PNG (qualidade 0.8 para arquivos menores)
      console.log(`[PDF→IMG] Convertendo para PNG...`);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Falha ao converter canvas para blob'));
            return;
          }
          resolve(blob);
        }, 'image/png', 0.8);
      });
      
      // Criar arquivo de imagem PRESERVANDO nome original do PDF
      const originalName = file.name.replace(/\.pdf$/i, '');
      const imageFile = new File(
        [blob],
        `${originalName}_pagina_${pageNum}.png`,
        { type: 'image/png' }
      );
      
      images.push(imageFile);
      console.log(`[PDF→IMG] Página ${pageNum}/${totalPages} convertida (${(blob.size / 1024).toFixed(1)} KB)`);
    }
    
    console.log(`[PDF→IMG] ✅ Conversão concluída: ${images.length} imagens geradas`);
    
    return {
      images,
      originalFileName: file.name,
    };
    
  } catch (error) {
    console.error('[PDF→IMG] ❌ Erro detalhado:', error);
    console.error('[PDF→IMG] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    console.error('[PDF→IMG] Tipo do erro:', error instanceof Error ? error.constructor.name : typeof error);
    
    // Melhorar mensagem de erro para o usuário
    let errorMessage = 'Erro desconhecido ao converter PDF';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Detectar erros comuns e fornecer mensagens mais úteis
      if (errorMessage.includes('Worker') || errorMessage.includes('worker')) {
        errorMessage = 'Erro ao carregar o processador de PDF. Tente recarregar a página.';
      } else if (errorMessage.includes('Invalid PDF') || errorMessage.includes('corrompido')) {
        errorMessage = 'PDF inválido ou corrompido. Verifique o arquivo.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Tempo esgotado')) {
        errorMessage = 'Tempo esgotado ao processar PDF. Tente um arquivo menor.';
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Erro de rede ao carregar o processador de PDF. Verifique sua conexão.';
      }
    }
    
    throw new Error(`Falha ao converter PDF "${file.name}": ${errorMessage}`);
  }
}

/**
 * Verifica se um arquivo é um PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * ✅ CORREÇÃO #2: Função auxiliar para converter PDF com timeout
 * Evita que conversões travadas bloqueiem o sistema indefinidamente
 */
export async function convertPDFToImagesWithTimeout(
  file: File,
  maxPages: number = 10,
  timeoutMs: number = 60000, // 60 segundos por padrão
  onProgress?: (current: number, total: number) => void
): Promise<PDFConversionResult> {
  console.log(`[PDF→IMG] Iniciando conversão com timeout de ${timeoutMs / 1000}s`);
  
  return Promise.race([
    convertPDFToImages(file, maxPages, onProgress),
    new Promise<PDFConversionResult>((_, reject) => 
      setTimeout(() => {
        reject(new Error(`Tempo esgotado ao converter "${file.name}". O arquivo pode ser muito grande ou complexo. Tente converter manualmente para PNG/JPG.`));
      }, timeoutMs)
    )
  ]);
}

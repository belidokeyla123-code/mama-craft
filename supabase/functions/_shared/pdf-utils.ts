/**
 * Utilitários para processamento de PDFs usando CloudConvert API
 * 
 * CloudConvert é um serviço de conversão de arquivos que suporta PDFs.
 * Documentação: https://cloudconvert.com/api/v2
 */

interface CloudConvertJob {
  id: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  tasks: CloudConvertTask[];
}

interface CloudConvertTask {
  id: string;
  name: string;
  status: string;
  result?: {
    files?: Array<{
      filename: string;
      url: string;
    }>;
  };
}

/**
 * Converte PDF para imagens PNG usando CloudConvert
 * 
 * @param pdfBase64 - PDF em formato base64
 * @returns Array de imagens em base64
 */
export async function convertPDFToImages(pdfBase64: string): Promise<string[]> {
  console.log('[PDF-UTILS] Iniciando conversão de PDF para imagens via CloudConvert...');
  
  const apiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
  if (!apiKey) {
    throw new Error('CLOUDCONVERT_API_KEY não configurada nos secrets');
  }
  
  try {
    // 1. Criar um job de conversão
    const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-pdf': {
            operation: 'import/base64',
            file: pdfBase64,
            filename: 'document.pdf',
          },
          'convert-to-png': {
            operation: 'convert',
            input: 'import-pdf',
            output_format: 'png',
            pages: 'all', // Converter todas as páginas
            pixel_density: 200, // DPI para boa qualidade
          },
          'export-images': {
            operation: 'export/url',
            input: 'convert-to-png',
          },
        },
      }),
    });

    if (!createJobResponse.ok) {
      const error = await createJobResponse.text();
      throw new Error(`Erro ao criar job no CloudConvert: ${error}`);
    }

    const job: CloudConvertJob = await createJobResponse.json();
    console.log(`[PDF-UTILS] Job criado: ${job.id}`);

    // 2. Aguardar o job finalizar (polling)
    let jobStatus = job.status;
    let attempts = 0;
    const maxAttempts = 60; // 60 segundos de timeout

    while (jobStatus !== 'finished' && jobStatus !== 'error' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Aguardar 1 segundo
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Erro ao verificar status do job');
      }

      const statusData: CloudConvertJob = await statusResponse.json();
      jobStatus = statusData.status;
      attempts++;

      console.log(`[PDF-UTILS] Status do job: ${jobStatus} (tentativa ${attempts}/${maxAttempts})`);
    }

    if (jobStatus === 'error') {
      throw new Error('Erro durante a conversão do PDF');
    }

    if (jobStatus !== 'finished') {
      throw new Error('Timeout ao aguardar conversão do PDF');
    }

    // 3. Obter URLs das imagens geradas
    const finalJobResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.id}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const finalJob: CloudConvertJob = await finalJobResponse.json();
    const exportTask = finalJob.tasks.find(t => t.name === 'export-images');

    if (!exportTask || !exportTask.result || !exportTask.result.files) {
      throw new Error('Nenhuma imagem foi gerada na conversão');
    }

    console.log(`[PDF-UTILS] ${exportTask.result.files.length} página(s) convertida(s)`);

    // 4. Baixar as imagens e converter para base64
    const images: string[] = [];

    for (const file of exportTask.result.files) {
      console.log(`[PDF-UTILS] Baixando: ${file.filename}`);
      
      const imageResponse = await fetch(file.url);
      if (!imageResponse.ok) {
        throw new Error(`Erro ao baixar imagem: ${file.filename}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      images.push(imageBase64);
    }

    console.log(`[PDF-UTILS] ✅ Conversão concluída: ${images.length} imagem(ns)`);
    return images;

  } catch (error) {
    console.error('[PDF-UTILS] ❌ Erro ao converter PDF:', error);
    throw error;
  }
}

/**
 * Verifica se um arquivo é PDF baseado no MIME type ou extensão
 */
export function isPDF(mimeType: string | null, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

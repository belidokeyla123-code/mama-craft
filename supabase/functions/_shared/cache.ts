/**
 * Intelligent caching system with TTL and invalidation
 */

export interface CacheMetadata {
  document_hash: string;
  analysis_hash?: string;
  expires_at: string;
  version: number;
}

/**
 * Generate hash from string
 */
async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if cache is valid and up-to-date
 */
export async function isCacheValid(
  supabase: any,
  caseId: string,
  cacheType: 'petition' | 'analysis' | 'jurisprudence',
  currentDocumentIds: string[]
): Promise<{ valid: boolean; data?: any; reason?: string }> {
  try {
    // Generate hash of current documents
    const documentHash = await generateHash(currentDocumentIds.sort().join(','));
    
    let table, idField;
    switch (cacheType) {
      case 'petition':
        table = 'drafts';
        idField = 'case_id';
        break;
      case 'analysis':
        table = 'case_analysis';
        idField = 'case_id';
        break;
      case 'jurisprudence':
        table = 'jurisprudence_results';
        idField = 'case_id';
        break;
      default:
        return { valid: false, reason: 'Invalid cache type' };
    }
    
    // Get latest cache entry
    const { data: cacheEntry } = await supabase
      .from(table)
      .select('*, payload')
      .eq(idField, caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!cacheEntry) {
      return { valid: false, reason: 'No cache found' };
    }
    
    const metadata = cacheEntry.payload as CacheMetadata | undefined;
    
    // Check if cache has metadata
    if (!metadata?.document_hash) {
      return { valid: false, reason: 'No cache metadata' };
    }
    
    // Check if documents changed
    if (metadata.document_hash !== documentHash) {
      return { valid: false, reason: 'Documents changed' };
    }
    
    // Check if cache expired (24h TTL)
    if (metadata.expires_at) {
      const expiresAt = new Date(metadata.expires_at);
      if (expiresAt < new Date()) {
        return { valid: false, reason: 'Cache expired' };
      }
    }
    
    console.log(`[CACHE] ✅ Valid cache found for ${cacheType}`);
    return { valid: true, data: cacheEntry };
    
  } catch (error) {
    console.error('[CACHE] Error checking cache:', error);
    return { valid: false, reason: 'Cache check error' };
  }
}

/**
 * Save data with cache metadata
 */
export async function saveWithCache(
  supabase: any,
  table: string,
  data: any,
  documentIds: string[]
): Promise<void> {
  const documentHash = await generateHash(documentIds.sort().join(','));
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24h TTL
  
  const metadata: CacheMetadata = {
    document_hash: documentHash,
    expires_at: expiresAt.toISOString(),
    version: 1
  };
  
  await supabase.from(table).insert({
    ...data,
    payload: metadata
  });
  
  console.log(`[CACHE] Saved with metadata:`, metadata);
}

/**
 * Invalidate cache for a case
 */
export async function invalidateCache(
  supabase: any,
  caseId: string,
  cacheTypes: Array<'petition' | 'analysis' | 'jurisprudence'>
): Promise<void> {
  const tables = {
    petition: 'drafts',
    analysis: 'case_analysis',
    jurisprudence: 'jurisprudence_results'
  };
  
  for (const type of cacheTypes) {
    await supabase
      .from(tables[type])
      .delete()
      .eq('case_id', caseId);
      
    console.log(`[CACHE] Invalidated ${type} cache for case ${caseId}`);
  }
}

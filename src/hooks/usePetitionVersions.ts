import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PetitionVersion {
  id: string;
  version: number;
  markdown_content: string;
  generated_at: string;
  payload: {
    corrected_by_judge?: boolean;
    regional_adaptations_applied?: boolean;
    appellate_adaptations_applied?: boolean;
    recalculated_valor_causa?: boolean;
    description?: string;
  };
  changes_summary?: {
    added_chars: number;
    removed_chars: number;
    char_diff_percent: number;
  };
}

export const usePetitionVersions = (caseId: string | null) => {
  const [versions, setVersions] = useState<PetitionVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<PetitionVersion | null>(null);

  useEffect(() => {
    if (caseId) {
      loadVersions();
    }
  }, [caseId]);

  const loadVersions = async () => {
    if (!caseId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('case_id', caseId)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        // Calculate version numbers and diffs
        const versionsWithDiff = data.map((draft, index) => {
          const version = data.length - index;
          const prev = data[index + 1];
          
          let changes_summary;
          if (prev) {
            const currentLen = draft.markdown_content?.length || 0;
            const prevLen = prev.markdown_content?.length || 0;
            const diff = currentLen - prevLen;
            
            changes_summary = {
              added_chars: diff > 0 ? diff : 0,
              removed_chars: diff < 0 ? Math.abs(diff) : 0,
              char_diff_percent: ((diff / prevLen) * 100).toFixed(1)
            };
          }

          return {
            ...draft,
            version,
            changes_summary
          } as PetitionVersion;
        });

        setVersions(versionsWithDiff);
        setCurrentVersion(versionsWithDiff[0]);
      }
    } catch (error) {
      console.error('[VERSIONS] Error loading:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVersionDescription = (version: PetitionVersion): string => {
    const payload = version.payload;
    
    if (payload?.description) return payload.description;
    
    const tags = [];
    if (payload?.corrected_by_judge) tags.push('Correções do Juiz');
    if (payload?.regional_adaptations_applied) tags.push('Adaptações Regionais');
    if (payload?.appellate_adaptations_applied) tags.push('Adaptações Recursais');
    if (payload?.recalculated_valor_causa) tags.push('Valor Recalculado');
    
    return tags.length > 0 ? tags.join(' + ') : 'Versão Inicial';
  };

  const restoreVersion = async (version: PetitionVersion) => {
    if (!caseId) return null;
    
    try {
      // Create new version from restored content
      const { data, error } = await supabase
        .from('drafts')
        .insert({
          case_id: caseId,
          markdown_content: version.markdown_content,
          payload: {
            ...version.payload,
            restored_from_version: version.version,
            description: `Restaurado da versão ${version.version}`
          }
        })
        .select()
        .single();

      if (error) throw error;

      await loadVersions(); // Reload versions
      return data;
    } catch (error) {
      console.error('[VERSIONS] Error restoring:', error);
      return null;
    }
  };

  const compareVersions = (v1: PetitionVersion, v2: PetitionVersion) => {
    const text1 = v1.markdown_content || '';
    const text2 = v2.markdown_content || '';
    
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    
    const diff = [];
    const maxLines = Math.max(lines1.length, lines2.length);
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';
      
      if (line1 !== line2) {
        diff.push({
          lineNumber: i + 1,
          removed: line1,
          added: line2
        });
      }
    }
    
    return diff;
  };

  return {
    versions,
    loading,
    currentVersion,
    loadVersions,
    getVersionDescription,
    restoreVersion,
    compareVersions
  };
};

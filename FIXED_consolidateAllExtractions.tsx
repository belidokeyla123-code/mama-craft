/**
 * 🎯 FUNÇÃO CONSOLIDADA CORRIGIDA
 * 
 * PROBLEMA IDENTIFICADO:
 * - Edge Function salva: motherName, motherCpf, childName, childBirthDate
 * - Consolidação buscava: nome_completo, cpf (ERRADO!)
 * 
 * SOLUÇÃO:
 * - Buscar os campos CORRETOS que a Edge Function realmente salva
 */

const consolidateAllExtractions = async (caseId: string) => {
  console.log('[Consolidation] Iniciando consolidação de extrações para caso:', caseId);
  
  // Buscar TODAS as extrações do caso
  const { data: extractions, error } = await supabase
    .from('extractions')
    .select('entities, auto_filled_fields, periodos_rurais')
    .eq('case_id', caseId)
    .order('extracted_at', { ascending: true }); // Mais antigas primeiro

  if (error) {
    console.error('[Consolidation] Erro ao buscar extrações:', error);
    return null;
  }

  if (!extractions || extractions.length === 0) {
    console.log('[Consolidation] Nenhuma extração encontrada');
    return null;
  }

  console.log(`[Consolidation] Consolidando ${extractions.length} extrações`);

  // Objeto final consolidado
  const consolidated: any = {
    // Dados da mãe/autora
    author_name: null,
    author_cpf: null,
    author_rg: null,
    author_birth_date: null,
    author_address: null,
    author_phone: null,
    author_whatsapp: null,
    author_marital_status: null,
    
    // Dados da criança
    child_name: null,
    child_birth_date: null,
    child_birth_place: null,
    
    // Dados do pai
    father_name: null,
    father_cpf: null,
    
    // Dados do cônjuge
    spouse_name: null,
    spouse_cpf: null,
    marriage_date: null,
    
    // Dados previdenciários
    nit: null,
    birth_city: null,
    birth_state: null,
    
    // Dados da terra
    land_owner_name: null,
    land_owner_cpf: null,
    land_owner_rg: null,
    land_ownership_type: null,
    land_area: null,
    land_total_area: null,
    land_exploited_area: null,
    land_itr: null,
    land_property_name: null,
    land_municipality: null,
    land_cession_type: null,
    
    // Atividades rurais
    rural_activities_planting: null,
    rural_activities_breeding: null,
    
    // Processo administrativo
    has_ra: false,
    ra_protocol: null,
    ra_request_date: null,
    ra_denial_date: null,
    ra_denial_reason: null,
    
    // Arrays para merge
    school_history: [],
    rural_periods: [],
    urban_periods: [],
    manual_benefits: [],
    family_members: [],
    
    // Objeto para merge
    health_declaration_ubs: {},
  };

  // Iterar sobre TODAS as extrações
  for (const extraction of extractions) {
    const entities = (extraction.entities || {}) as any;
    const autoFilled = (extraction.auto_filled_fields || {}) as any;
    const periodosRurais = (extraction.periodos_rurais || []) as any[];

    // ═══════════════════════════════════════════════════════════
    // ✅ CORREÇÃO: Buscar campos CORRETOS que a Edge Function salva
    // ═══════════════════════════════════════════════════════════
    
    // DADOS DA MÃE/AUTORA (motherName → author_name)
    if (!consolidated.author_name && entities.motherName) {
      consolidated.author_name = entities.motherName;
      console.log('[Consolidation] ✅ Nome da mãe encontrado:', entities.motherName);
    }
    if (!consolidated.author_cpf && entities.motherCpf) {
      consolidated.author_cpf = entities.motherCpf;
      console.log('[Consolidation] ✅ CPF da mãe encontrado:', entities.motherCpf);
    }
    if (!consolidated.author_rg && entities.motherRg) {
      consolidated.author_rg = entities.motherRg;
    }
    if (!consolidated.author_birth_date && entities.motherBirthDate) {
      consolidated.author_birth_date = entities.motherBirthDate;
    }
    if (!consolidated.author_address && entities.motherAddress) {
      consolidated.author_address = entities.motherAddress;
    }
    if (!consolidated.author_phone && entities.motherPhone) {
      consolidated.author_phone = entities.motherPhone;
    }
    if (!consolidated.author_whatsapp && entities.motherWhatsapp) {
      consolidated.author_whatsapp = entities.motherWhatsapp;
    }
    if (!consolidated.author_marital_status && entities.maritalStatus) {
      consolidated.author_marital_status = entities.maritalStatus;
    }
    
    // DADOS DA CRIANÇA (childName → child_name)
    if (!consolidated.child_name && entities.childName) {
      consolidated.child_name = entities.childName;
      console.log('[Consolidation] ✅ Nome da criança encontrado:', entities.childName);
    }
    if (!consolidated.child_birth_date && entities.childBirthDate) {
      consolidated.child_birth_date = entities.childBirthDate;
      console.log('[Consolidation] ✅ Data de nascimento encontrada:', entities.childBirthDate);
    }
    if (!consolidated.child_birth_place && entities.childBirthPlace) {
      consolidated.child_birth_place = entities.childBirthPlace;
    }
    
    // DADOS DO PAI
    if (!consolidated.father_name && entities.fatherName) {
      consolidated.father_name = entities.fatherName;
    }
    if (!consolidated.father_cpf && entities.fatherCpf) {
      consolidated.father_cpf = entities.fatherCpf;
    }
    
    // DADOS DO CÔNJUGE
    if (!consolidated.spouse_name && entities.spouseName) {
      consolidated.spouse_name = entities.spouseName;
    }
    if (!consolidated.spouse_cpf && entities.spouseCpf) {
      consolidated.spouse_cpf = entities.spouseCpf;
    }
    if (!consolidated.marriage_date && entities.marriageDate) {
      consolidated.marriage_date = entities.marriageDate;
    }
    
    // DADOS PREVIDENCIÁRIOS
    if (!consolidated.nit && entities.nit) {
      consolidated.nit = entities.nit;
    }
    if (!consolidated.birth_city && entities.birthCity) {
      consolidated.birth_city = entities.birthCity;
    }
    if (!consolidated.birth_state && entities.birthState) {
      consolidated.birth_state = entities.birthState;
    }
    
    // DADOS DA TERRA
    if (!consolidated.land_owner_name && entities.landOwnerName) {
      consolidated.land_owner_name = entities.landOwnerName;
    }
    if (!consolidated.land_owner_cpf && entities.landOwnerCpf) {
      consolidated.land_owner_cpf = entities.landOwnerCpf;
    }
    if (!consolidated.land_owner_rg && entities.landOwnerRg) {
      consolidated.land_owner_rg = entities.landOwnerRg;
    }
    if (!consolidated.land_ownership_type && entities.landOwnershipType) {
      consolidated.land_ownership_type = entities.landOwnershipType;
    }
    if (!consolidated.land_area && entities.landArea) {
      consolidated.land_area = entities.landArea;
    }
    if (!consolidated.land_total_area && entities.landTotalArea) {
      consolidated.land_total_area = entities.landTotalArea;
    }
    if (!consolidated.land_exploited_area && entities.landExploitedArea) {
      consolidated.land_exploited_area = entities.landExploitedArea;
    }
    if (!consolidated.land_itr && entities.landITR) {
      consolidated.land_itr = entities.landITR;
    }
    if (!consolidated.land_property_name && entities.landPropertyName) {
      consolidated.land_property_name = entities.landPropertyName;
    }
    if (!consolidated.land_municipality && entities.landMunicipality) {
      consolidated.land_municipality = entities.landMunicipality;
    }
    if (!consolidated.land_cession_type && entities.landCessionType) {
      consolidated.land_cession_type = entities.landCessionType;
    }
    
    // ATIVIDADES RURAIS
    if (!consolidated.rural_activities_planting && entities.ruralActivitiesPlanting) {
      consolidated.rural_activities_planting = entities.ruralActivitiesPlanting;
    }
    if (!consolidated.rural_activities_breeding && entities.ruralActivitiesBreeding) {
      consolidated.rural_activities_breeding = entities.ruralActivitiesBreeding;
    }
    
    // PROCESSO ADMINISTRATIVO
    if (entities.raProtocol) {
      consolidated.has_ra = true;
      if (!consolidated.ra_protocol) consolidated.ra_protocol = entities.raProtocol;
    }
    if (!consolidated.ra_request_date && entities.raRequestDate) {
      consolidated.ra_request_date = entities.raRequestDate;
    }
    if (!consolidated.ra_denial_date && entities.raDenialDate) {
      consolidated.ra_denial_date = entities.raDenialDate;
    }
    if (!consolidated.ra_denial_reason && entities.raDenialReason) {
      consolidated.ra_denial_reason = entities.raDenialReason;
    }

    // ═══════════════════════════════════════════════════════════
    // ARRAYS - Merge Inteligente com Deduplicação
    // ═══════════════════════════════════════════════════════════
    
    // HISTÓRICO ESCOLAR
    if (entities.schoolHistory && Array.isArray(entities.schoolHistory)) {
      consolidated.school_history.push(...entities.schoolHistory);
    }
    if (autoFilled.schoolHistory && Array.isArray(autoFilled.schoolHistory)) {
      consolidated.school_history.push(...autoFilled.schoolHistory);
    }
    
    // PERÍODOS RURAIS (múltiplas fontes)
    if (periodosRurais && Array.isArray(periodosRurais)) {
      consolidated.rural_periods.push(...periodosRurais);
    }
    if (entities.ruralPeriods && Array.isArray(entities.ruralPeriods)) {
      consolidated.rural_periods.push(...entities.ruralPeriods);
    }
    if (autoFilled.ruralPeriods && Array.isArray(autoFilled.ruralPeriods)) {
      consolidated.rural_periods.push(...autoFilled.ruralPeriods);
    }
    if (autoFilled.rural_periods && Array.isArray(autoFilled.rural_periods)) {
      consolidated.rural_periods.push(...autoFilled.rural_periods);
    }
    
    // PERÍODOS URBANOS
    if (entities.urbanPeriods && Array.isArray(entities.urbanPeriods)) {
      consolidated.urban_periods.push(...entities.urbanPeriods);
    }
    if (autoFilled.urbanPeriods && Array.isArray(autoFilled.urbanPeriods)) {
      consolidated.urban_periods.push(...autoFilled.urbanPeriods);
    }
    if (autoFilled.urban_periods && Array.isArray(autoFilled.urban_periods)) {
      consolidated.urban_periods.push(...autoFilled.urban_periods);
    }
    
    // BENEFÍCIOS
    if (entities.manualBenefits && Array.isArray(entities.manualBenefits)) {
      consolidated.manual_benefits.push(...entities.manualBenefits);
    }
    if (autoFilled.manualBenefits && Array.isArray(autoFilled.manualBenefits)) {
      consolidated.manual_benefits.push(...autoFilled.manualBenefits);
    }
    if (autoFilled.manual_benefits && Array.isArray(autoFilled.manual_benefits)) {
      consolidated.manual_benefits.push(...autoFilled.manual_benefits);
    }
    
    // MEMBROS DA FAMÍLIA
    if (entities.familyMembers && Array.isArray(entities.familyMembers)) {
      consolidated.family_members.push(...entities.familyMembers);
    }
    if (entities.familyMembersDetailed && Array.isArray(entities.familyMembersDetailed)) {
      consolidated.family_members.push(...entities.familyMembersDetailed);
    }
    if (autoFilled.familyMembers && Array.isArray(autoFilled.familyMembers)) {
      consolidated.family_members.push(...autoFilled.familyMembers);
    }
    if (autoFilled.family_members && Array.isArray(autoFilled.family_members)) {
      consolidated.family_members.push(...autoFilled.family_members);
    }

    // ═══════════════════════════════════════════════════════════
    // OBJETO - Deep Merge
    // ═══════════════════════════════════════════════════════════
    
    // DECLARAÇÃO DE SAÚDE UBS
    if (entities.healthDeclarationUbs && typeof entities.healthDeclarationUbs === 'object') {
      consolidated.health_declaration_ubs = {
        ...consolidated.health_declaration_ubs,
        ...entities.healthDeclarationUbs
      };
    }
    if (entities.health_declaration_ubs && typeof entities.health_declaration_ubs === 'object') {
      consolidated.health_declaration_ubs = {
        ...consolidated.health_declaration_ubs,
        ...entities.health_declaration_ubs
      };
    }
    if (autoFilled.healthDeclarationUbs && typeof autoFilled.healthDeclarationUbs === 'object') {
      consolidated.health_declaration_ubs = {
        ...consolidated.health_declaration_ubs,
        ...autoFilled.healthDeclarationUbs
      };
    }
    if (autoFilled.health_declaration_ubs && typeof autoFilled.health_declaration_ubs === 'object') {
      consolidated.health_declaration_ubs = {
        ...consolidated.health_declaration_ubs,
        ...autoFilled.health_declaration_ubs
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÓS-PROCESSAMENTO: Deduplicação e Ordenação
  // ═══════════════════════════════════════════════════════════
  
  // HISTÓRICO ESCOLAR: Remover duplicatas
  if (consolidated.school_history.length > 0) {
    const uniqueSchool = new Map();
    consolidated.school_history.forEach((entry: any) => {
      const key = `${entry.instituicao}-${entry.periodo_inicio}`;
      if (!uniqueSchool.has(key)) {
        uniqueSchool.set(key, entry);
      }
    });
    consolidated.school_history = Array.from(uniqueSchool.values());
  }
  
  // PERÍODOS RURAIS: Remover duplicatas
  if (consolidated.rural_periods.length > 0) {
    const uniqueRural = new Map();
    consolidated.rural_periods.forEach((period: any) => {
      const key = `${period.startDate || period.data_inicio}-${period.endDate || period.data_fim}`;
      if (!uniqueRural.has(key)) {
        uniqueRural.set(key, period);
      }
    });
    consolidated.rural_periods = Array.from(uniqueRural.values())
      .sort((a: any, b: any) => {
        const dateA = new Date(a.startDate || a.data_inicio || '1900-01-01');
        const dateB = new Date(b.startDate || b.data_inicio || '1900-01-01');
        return dateA.getTime() - dateB.getTime();
      });
  }
  
  // PERÍODOS URBANOS: Remover duplicatas
  if (consolidated.urban_periods.length > 0) {
    const uniqueUrban = new Map();
    consolidated.urban_periods.forEach((period: any) => {
      const key = `${period.startDate || period.data_inicio}-${period.endDate || period.data_fim}`;
      if (!uniqueUrban.has(key)) {
        uniqueUrban.set(key, period);
      }
    });
    consolidated.urban_periods = Array.from(uniqueUrban.values());
  }
  
  // BENEFÍCIOS: Remover duplicatas
  if (consolidated.manual_benefits.length > 0) {
    const uniqueBenefits = new Map();
    consolidated.manual_benefits.forEach((benefit: any) => {
      const key = benefit.nb || benefit.benefit_type;
      if (!uniqueBenefits.has(key)) {
        uniqueBenefits.set(key, benefit);
      }
    });
    consolidated.manual_benefits = Array.from(uniqueBenefits.values());
  }
  
  // MEMBROS DA FAMÍLIA: Remover duplicatas
  if (consolidated.family_members.length > 0) {
    const uniqueMembers = new Map();
    consolidated.family_members.forEach((member: any) => {
      const key = member.cpf || member.name || member.nome;
      if (!uniqueMembers.has(key)) {
        uniqueMembers.set(key, member);
      }
    });
    consolidated.family_members = Array.from(uniqueMembers.values());
  }

  console.log('[Consolidation] ✅ Dados consolidados:', {
    author_name: consolidated.author_name || 'VAZIO',
    author_cpf: consolidated.author_cpf || 'VAZIO',
    child_name: consolidated.child_name || 'VAZIO',
    child_birth_date: consolidated.child_birth_date || 'VAZIO',
    school_history_count: consolidated.school_history.length,
    rural_periods_count: consolidated.rural_periods.length,
    urban_periods_count: consolidated.urban_periods.length,
    manual_benefits_count: consolidated.manual_benefits.length,
    family_members_count: consolidated.family_members.length,
    has_health_declaration: Object.keys(consolidated.health_declaration_ubs).length > 0
  });

  return consolidated;
};

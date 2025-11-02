-- Criar trigger para auto-atribuir casos ao criador
-- Isso resolve o erro "new row violates row-level security policy"
-- garantindo que o usuário sempre tenha permissão de UPDATE no caso que criou

CREATE TRIGGER auto_assign_case_owner_trigger
AFTER INSERT ON cases
FOR EACH ROW
EXECUTE FUNCTION auto_assign_case_owner();
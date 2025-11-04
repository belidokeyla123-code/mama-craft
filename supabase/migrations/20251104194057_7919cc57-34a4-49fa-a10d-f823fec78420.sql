-- Recriar o trigger de auto-assignment de casos
-- Este trigger garante que quando um caso é criado, automaticamente
-- cria um case_assignment para o usuário autenticado

DROP TRIGGER IF EXISTS auto_assign_case_owner_trigger ON cases;

CREATE TRIGGER auto_assign_case_owner_trigger
  AFTER INSERT ON cases
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_case_owner();
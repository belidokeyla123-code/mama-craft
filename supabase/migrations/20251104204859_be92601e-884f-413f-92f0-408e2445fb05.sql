-- Recriar o trigger que cria automaticamente o case_assignment
DROP TRIGGER IF EXISTS trigger_auto_assign_case_owner ON public.cases;

CREATE TRIGGER trigger_auto_assign_case_owner
AFTER INSERT ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_case_owner();
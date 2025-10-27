import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center px-4">
        <FileQuestion className="h-24 w-24 mx-auto text-muted-foreground/50 mb-6" />
        <h1 className="mb-4 text-6xl font-bold text-foreground">404</h1>
        <p className="mb-8 text-xl text-muted-foreground">Página não encontrada</p>
        <Link to="/">
          <Button size="lg" variant="default">
            Voltar ao Início
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { 
  Scale, 
  FileText, 
  MessageSquare, 
  FileEdit, 
  Gavel 
} from "lucide-react";

interface PetitionType {
  id: string;
  label: string;
  icon: any;
}

const petitionTypes: PetitionType[] = [
  {
    id: "peticao_inicial",
    label: "Petição Inicial",
    icon: FileText,
  },
  {
    id: "recurso_apelacao",
    label: "Recurso Nominado/Apelação",
    icon: MessageSquare,
  },
  {
    id: "embargos",
    label: "Embargos",
    icon: FileEdit,
  },
  {
    id: "pilf",
    label: "PILF",
    icon: Gavel,
  }
];

export function DashboardSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { open: sidebarOpen } = useSidebar();
  const searchParams = new URLSearchParams(location.search);
  
  const currentType = searchParams.get("type");
  
  const [expandedArea, setExpandedArea] = useState(true);
  const [expandedSub, setExpandedSub] = useState(true);

  const handleTypeClick = (typeId: string) => {
    navigate(`/dashboard?type=${typeId}`);
  };

  const handleAllClick = () => {
    navigate('/dashboard');
  };

  const isActive = (typeId: string) => currentType === typeId;
  const isAllActive = !currentType;

  return (
    <Sidebar className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel
            className="cursor-pointer hover:bg-muted/50 transition-smooth flex items-center gap-2"
            onClick={() => setExpandedArea(!expandedArea)}
          >
            <Scale className="h-4 w-4" />
            {sidebarOpen && "Previdência"}
          </SidebarGroupLabel>
          
          {expandedArea && (
            <SidebarGroupContent>
              <div className="pl-2">
                <div
                  className="flex items-center px-2 py-1.5 text-sm font-medium cursor-pointer hover:bg-muted/50 rounded-md transition-smooth"
                  onClick={() => setExpandedSub(!expandedSub)}
                >
                  {sidebarOpen && "📁 Auxílio Maternidade"}
                </div>
                
                {expandedSub && (
                  <SidebarMenu className="pl-4">
                    {/* Opção Ver Todos */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleAllClick}
                        isActive={isAllActive}
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        {sidebarOpen && <span>Todos</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* Tipos de peça */}
                    {petitionTypes.map((type) => (
                      <SidebarMenuItem key={type.id}>
                        <SidebarMenuButton
                          onClick={() => handleTypeClick(type.id)}
                          isActive={isActive(type.id)}
                          className="gap-2"
                        >
                          <type.icon className="h-4 w-4" />
                          {sidebarOpen && <span>{type.label}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </div>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
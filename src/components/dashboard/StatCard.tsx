import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: 'blue' | 'purple' | 'green' | 'red' | 'orange';
}

const colorClasses = {
  blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  green: 'bg-green-500/10 text-green-600 border-green-500/20',
  red: 'bg-red-500/10 text-red-600 border-red-500/20',
  orange: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export default function StatCard({ label, value, icon: Icon, color }: Props) {
  return (
    <Card className={`p-4 border-2 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </Card>
  );
}

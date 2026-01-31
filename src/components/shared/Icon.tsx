import * as Lucide from 'lucide-react';
import React from 'react';

interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  readonly name: keyof typeof Lucide | (string & {});
  readonly size?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className, ...props }) => {
  const LucideIcon = Lucide[name as keyof typeof Lucide] as React.ElementType;

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon size={size} className={className} {...props} />;
};

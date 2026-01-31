import * as Lucide from 'lucide-react';

import type { ElementType, FC, SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: keyof typeof Lucide | (string & {});
  readonly size?: number;
}

export const Icon: FC<IconProps> = ({ name, size = 20, className, ...props }) => {
  const LucideIcon = Lucide[name as keyof typeof Lucide] as ElementType;

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon size={size} className={className} {...props} />;
};

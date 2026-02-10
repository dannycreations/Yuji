import * as Lucide from 'lucide-react';
import { memo } from 'react';

import type { ElementType, FC, SVGProps } from 'react';

export type IconName = keyof typeof Lucide | (string & {});

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  readonly size?: number;
}

export const Icon: FC<IconProps> = memo(({ name, size = 20, className, ...props }) => {
  const LucideIcon = Lucide[name as keyof typeof Lucide] as ElementType;

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon size={size} className={className} {...props} />;
});

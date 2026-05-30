import type { ReactNode } from 'react';
import { sectionStyles } from '../utils/styles';

interface M5SectionProps {
  title: string;
  icon: ReactNode;
  colorClass: string;
  children: ReactNode;
}

export default function M5Section({ title, icon, colorClass, children }: M5SectionProps) {
  return (
    <div className={`${sectionStyles.container} ${colorClass}`}>
      <div className={sectionStyles.header}>
        {icon}
        <p className={sectionStyles.title}>{title}</p>
      </div>
      <div className={sectionStyles.grid}>{children}</div>
    </div>
  );
}

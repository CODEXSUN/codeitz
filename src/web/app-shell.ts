import logoSrc from './assets/brand-logo.svg';
import logoDarkSrc from './assets/brand-logo-dark.svg';
import { createElement, forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const appBrand = { name: 'Codeitz', logoSrc, logoDarkSrc };

export const CodeitzIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  createElement('svg', { ...props, ref, viewBox: '0 0 64 64', fill: 'none' },
    createElement('image', { href: logoSrc, width: 64, height: 64 })),
);
CodeitzIcon.displayName = 'CodeitzIcon';

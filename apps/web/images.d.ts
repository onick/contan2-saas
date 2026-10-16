// Tipos de imports estáticos de imagen (`import shot from './x.png'` → StaticImageData).
// next-env.d.ts ya los trae, pero está gitignored y solo existe tras `next build/dev`;
// con esta referencia `tsc --noEmit` también pasa en un checkout limpio (CI).
/// <reference types="next/image-types/global" />

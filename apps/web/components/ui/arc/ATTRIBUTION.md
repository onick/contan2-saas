# Atribución · piezas portadas de Arc Library

Las piezas de esta carpeta se portaron como **fuente** desde [arc-library](https://github.com/kuratlielia/arc-library) (uiarc.dev), commit `b40c8906e8cc55cba920113be856b2e6d964885a` (2026-10-16T13:11:10Z), bajo licencia MIT. No se instala la librería ni su registro `@uiarc`, ni se adopta su `foundation.css`.

## Origen → destino

| Origen (arc-library) | Destino (contan2) |
|---|---|
| `registry/components/date-range-picker/date-range-picker.{tsx,module.css}` + `lib/use-today.ts` | `components/ui/arc/date-range-picker/*` |
| `registry/components/otp-input/otp-input.{tsx,module.css}` | `components/ui/arc/otp-input/*` |
| `registry/components/number-field/number-field.{tsx,module.css}` | `components/ui/arc/number-field/*` |
| `registry/components/split-button/split-button.{tsx,module.css}` | `components/ui/arc/split-button/*` |
| `registry/components/dropdown-menu/dropdown-menu.module.css` (tratamiento de movimiento) | `components/ui/arc/dropdown-menu/dropdown-menu.css` + cambios en `components/ui/DropdownMenu.tsx` |
| `registry/motion-tokens.ts` (duraciones y curvas) | valores reexpresados como variables CSS en `components/ui/arc/arc.css` |

## Adaptaciones

- Sin la dependencia `motion`: las animaciones pasan a CSS (transitions, `@starting-style`, keyframes) con alternativa `prefers-reduced-motion`.
- Tokens de contan2 (Tailwind v4 + marca por tenant derivada por luminancia) en lugar de los tokens de Arc; nada de colores sueltos.
- Español (es-DO), semana que inicia en lunes y zona America/Santo_Domingo.
- OTP sobre un único `<input>` (PIN de longitud variable), sin arrastre (scrub) ni repetición al mantener presionado en el campo numérico.

## Licencia de origen (MIT)

```
MIT License

Copyright (c) 2026 Elia Kuratli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

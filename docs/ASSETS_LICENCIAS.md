# Licencias de recursos gráficos

Registro de imágenes, iconos y modelos de terceros que sirve Dream. Antes de añadir uno nuevo, comprueba la licencia en su origen y añade aquí una fila.

## Objetos de asignatura (iconos 3D)

- **Qué:** 15 iconos de la colección **Microsoft Fluent Emoji**, variante **3D**.
- **Origen:** https://github.com/microsoft/fluentui-emoji (carpeta `assets/<nombre>/3D/<nombre>_3d.png`, rama `main`).
- **Licencia:** MIT. Comprobada el 17/10/2026 en `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/LICENSE`: «MIT License. Copyright (c) Microsoft Corporation.» Permite usar, copiar, modificar y distribuir, con la condición de incluir el aviso de copyright y de licencia (abajo).
- **Cambios:** PNG originales de 256 px redimensionados a 96 y 192 px y convertidos a WebP (calidad 86) con Pillow. No se ha cambiado el dibujo.
- **Dónde:** `public/subjects/<objeto>-{96,192}.webp`. El mapa asignatura → objeto está en `lib/subject-objects.ts`.

| Objeto (`public/subjects`) | Emoji de Fluent | Asignaturas |
|---|---|---|
| `globe` | Globe showing Europe-Africa | Geografía, Geografía e Historia |
| `abacus` | Abacus | Matemáticas (Fluent no tiene calculadora: no es un emoji Unicode) |
| `book` | Green book | Lengua y Literatura, idiomas clásicos |
| `brush` | Paintbrush | Plástica, Dibujo |
| `scroll` | Scroll | Historia |
| `atom` | Atom symbol | Física, Física y Química |
| `testtube` | Test tube | Química |
| `microscope` | Microscope | Biología, Biología y Geología |
| `speech` | Speech balloon | Inglés y otros idiomas |
| `bulb` | Light bulb | Filosofía |
| `note` | Musical note | Música |
| `laptop` | Laptop | Informática, Tecnología |
| `coin` | Coin | Economía |
| `ball` | Soccer ball | Educación Física |
| `cap` | Graduation cap | Otra (por defecto) |

### Aviso de licencia (MIT)

```
MIT License

Copyright (c) Microsoft Corporation.

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
SOFTWARE
```

## Modelos 3D de escritorio (PR 6)

- **Modelos:** construidos por nosotros con código, sin descargar ningún modelo ni textura. Son formas básicas de three (esferas, cilindros, toros, cajas redondeadas y perfiles torneados) con un plástico brillante. Código en `components/subject-3d/models.ts`; son del proyecto, con su misma licencia. Ningún modelo de terceros.
- **Colores:** los tokens `--pop-*` de `app/globals.css`, más cuatro neutros (blanco, crema, gris y tinta) y el azul cielo del mar del globo.

| Modelo (`lib/subject-3d.ts`) | Asignaturas | Diferencia con el icono estático |
|---|---|---|
| `calculator` | Matemáticas | Calculadora (el icono es un ábaco porque Fluent no tiene calculadora) |
| `globe` | Geografía, Geografía e Historia | |
| `book` | Lengua y Literatura, idiomas clásicos | |
| `brush` | Plástica, Dibujo | |
| `scroll` | Historia | |
| `atom` | Física, Física y Química | |
| `flask` | Química | Matraz, como pide el encargo (el icono es un tubo de ensayo) |
| `microscope` | Biología, Biología y Geología | |
| `speech` | Inglés y otros idiomas | |
| `bulb` | Filosofía | |
| `note` | Música | |
| `laptop` | Informática, Tecnología | |
| `coin` | Economía | |
| `ball` | Educación Física | |
| `cap` | Otra o desconocida (birrete, por defecto) | |

### Librería: three

- **Paquete:** `three` 0.170.0 (https://github.com/mrdoob/three.js), instalado con OK de Carlos.
- **Licencia:** MIT. Comprobada el 19/10/2026 en `node_modules/three/LICENSE` y en `package.json` («license»: «MIT»): «The MIT License. Copyright © 2010-2024 three.js authors». Mismas condiciones que el aviso MIT de arriba: incluir el aviso de copyright y de licencia.
- **Dónde:** solo en el trozo 3D que se carga con `import()` en escritorio (`components/subject-3d/scene.ts`); no va en el JS inicial.

### Librería aprobada y no usada: @react-three/fiber

- `@react-three/fiber` 9.0.0 es MIT (comprobado con `npm view @react-three/fiber@9.0.0 license` el 19/10/2026). Carlos aprobó instalarla, pero **no se usa ni queda en `package.json`**: con ella el trozo 3D pasaba de 150 KB comprimidos (226 KB con gzip -9 en una prueba con esbuild, porque importa three entero) y además necesita `use-sync-external-store`, que no estaba aprobado. Usamos three directamente.

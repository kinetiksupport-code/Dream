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

## Modelos 3D de escritorio

Pendiente (PR 6). Solo CC0 o equivalente, o modelos propios hechos por código.

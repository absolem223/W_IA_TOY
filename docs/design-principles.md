# Design Principles — Widget IA

## Filosofía Central

> El widget no es una aplicación. Es una presencia.

---

## Los 5 Principios Irrenunciables

### 1. En reposo → casi invisible
El widget existe en el escritorio del usuario sin competir con su trabajo.
La sombra idle es subperceptual. El transform es de 0.8px máximo.
Si el widget llama la atención en reposo, está fallando.

### 2. En interacción → preciso e intencional
Ninguna respuesta es instantánea. Todo tiene micro-delay.
El sistema debe sentirse como que "respondió porque quiso", no porque reaccionó.

### 3. Nunca neon, nunca glow visible
El color de acento `#6B8CAE` es un azul pizarra desaturado.
Refleja en lugar de afirmarse. Las sombras son tonales (slate/blue), nunca de color puro.

### 4. Shadow = grounding físico, no decoración
Las sombras le dan al widget peso y presencia tridimensional.
3 capas atmosféricas. Sin negro puro. Sin hard edges.
El usuario no debe poder "trazar" el contorno de la sombra con el ojo.

### 5. Border = frontera de material, no stroke gráfico
`border: 1px solid rgba(90, 120, 165, 0.08)` — casi imperceptible.
Complementado por un inner rim (`::after`, 3% white, 0.5px) que suaviza la transición.
Si el borde se nota → es demasiado.

---

## Identidad de Superficie

### Noise Texture
SVG inline con `feTurbulence fractalNoise` al 2.8% de opacidad.
Propósito: cualidad táctil de superficie. Solo perceptible en comparación directa sin/con.

### Border Radius Asimétrico
`border-radius: 20px 18px 14px 16px` — 6px de diferencia máxima entre esquinas.
Imperceptible conscientemente, pero elimina la percepción de "objeto perfectamente computado".

### Tipografía
- **Outfit 300** → identidad de marca (título del header, letter-spacing 0.12em)
- **Inter 400/500** → contenido funcional (chat, mensajes)

---

## Sistema de Contexto Adaptativo

El widget detecta el tema del OS via `matchMedia('prefers-color-scheme: dark')`.
- `data-bg="dark"` → sistema de sombras base (opacidades ~0.07-0.18)
- `data-bg="light"` → sistema de sombras light (opacidades ~0.13-0.28)

El cambio es reactivo: si el usuario cambia el tema del OS con el widget abierto,
las sombras y el border transicionan suavemente (320ms / 380ms).

---

## Variabilidad Temporal

Los delays de mensajes varían entre 50-140ms usando un ciclo determinístico `i % 3`.
- v0: 50ms (user) / 100ms (assistant)
- v1: 60ms (user) / 120ms (assistant) — **baseline**
- v2: 70ms (user) / 140ms (assistant)

Objetivo: el sistema no se siente mecánico en uso prolongado.
Sin `Math.random()`. Sin lógica compleja.

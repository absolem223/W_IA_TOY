# Motion System — Widget IA

## Identidad Visual
**Living Stone × Quiet Precision**

El widget existe como un objeto físico en el escritorio del usuario.
No como un elemento de UI flotante.

---

## Tokens de Duración

### Escala Base

| Token | Valor | Uso |
|---|---|---|
| `--dur-micro` | 80ms | Active states, click feedback |
| `--dur-fast` | 160ms | Hover, focus, color changes |
| `--dur-base` | 240ms | Entradas, cambios de estado |
| `--dur-slow` | 380ms | Paneles, reveals, layout |
| `--dur-idle` | 6000ms | **Reloj del sistema** — idle pulse |

### Escala de Contexto

| Token | Valor | Justificación perceptual |
|---|---|---|
| `--dur-msg-in` | 260ms | Transform de entrada de mensaje |
| `--dur-msg-fade` | 220ms | Opacity llega 40ms antes que transform |
| `--dur-blink` | 600ms | Rango 500-700ms = parpadeo natural |
| `--dur-typing` | 1000ms | 1s = ritmo humano de mecanografeo |

---

## Tokens de Easing

| Token | Curva | Uso |
|---|---|---|
| `--ease-micro` | `cubic-bezier(0.25, 0, 0, 1)` | Precisión técnica, micro-states |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Salidas fluidas, reveals |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.55, 1)` | Ciclos bidireccionales (idle, typing) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | **Único con overshoot.** Solo para arrivals. |

---

## Sistema de Sombras

3 capas atmosféricas. Sin negro puro. Color tonal `rgba(20, 30, 50, X)`.

| Estado | Descripción |
|---|---|
| `--shadow-idle` | Sub-perceptual. Anchored only when looked for. |
| `--shadow-base` | Widget activo/abierto. Grounding claro. |
| `--shadow-hover` | Elevación espacial. Nunca glow. |
| `--shadow-*-light` | Variantes para fondos claros (data-bg="light"). |

---

## Reglas de No-Regresión

- ✗ No agregar animaciones visibles en idle
- ✗ No modificar easings sin auditoría de impacto
- ✗ No usar `Math.random()` en timing — variabilidad es determinística
- ✗ No usar `rgba(0,0,0,...)` en ninguna capa
- ✗ No introducir acentos sobre 50% de saturación visible
- ✗ No separar box-shadow y transform en idlePulse

---

## Hooks de Audio (preparados, no activos)

Los puntos de sincronización están en `data-event`:

- `data-event="idle-pulse"` → widget container (reloj de 6s)
- `data-event="user-send"` → mensaje de usuario
- `data-event="assistant-first-response"` → primer response del assistant
- `data-event="message-in"` → cualquier otro mensaje

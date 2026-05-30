# Arquitectura de Engramas y Aprendizaje Conductual

Documento base para evolucionar Widget IA Toy desde un chat con memoria hacia un sistema cognitivo relacional adaptativo.

## Objetivo

La IA debe dejar de comportarse como un chatbot tradicional y pasar a funcionar como un sistema capaz de:

- recordar experiencias, hechos y patrones;
- inferir preferencias sin depender solo de prompts explicitos;
- ajustar tono, profundidad, iniciativa y continuidad;
- construir contexto acumulativo por usuario;
- detectar cambios conductuales;
- modificar su propio comportamiento a partir de experiencia persistente.

El principio central es simple: una memoria tradicional almacena informacion; un engrama modifica comportamiento.

## Filosofia De Comportamiento

La IA no debe sonar corporativa, repetir plantillas, interrumpir, hacer preguntas innecesarias, fingir emociones o quedarse atada a instrucciones explicitas cuando el contexto permite inferir una respuesta mejor.

La IA si debe inferir preferencias, recordar continuidad, adaptar profundidad, variar tono con naturalidad, reducir repeticion, reconocer cambios de estado del usuario y mejorar su conducta a partir de interacciones previas.

## Engrama

Un engrama es una unidad de experiencia contextualizada. No representa solo un dato, sino una huella con impacto potencial sobre respuestas futuras.

```ts
type EngramType =
  | 'episodic_event'
  | 'semantic_fact'
  | 'behavioral_pattern'
  | 'relational_state'
  | 'preference_signal'

interface Engram {
  id: string
  type: EngramType
  label: string
  content: string
  evidence: EngramEvidence[]
  confidence: number
  reinforcementCount: number
  emotionalWeight: number
  decayRate: number
  behavioralPriority: number
  temporalRelevance: number
  behavioralEffects: BehavioralEffect[]
  state: 'active' | 'dormant' | 'contradicted' | 'archived'
  createdAt: string
  lastReinforcedAt: string
}

interface EngramEvidence {
  source: 'explicit' | 'implicit' | 'reflection' | 'system'
  turnId?: string
  summary: string
  polarity: 'positive' | 'negative' | 'neutral'
  createdAt: string
}

type BehavioralEffect =
  | 'increase_specificity'
  | 'reduce_generic_tone'
  | 'increase_depth'
  | 'decrease_density'
  | 'increase_initiative'
  | 'decrease_questions'
  | 'preserve_continuity'
  | 'use_spanish_by_default'
```

Ejemplo:

```json
{
  "type": "behavioral_pattern",
  "label": "user_dislikes_generic_answers",
  "content": "El usuario tiende a rechazar respuestas vagas o corporativas.",
  "confidence": 0.91,
  "reinforcementCount": 12,
  "emotionalWeight": 0.63,
  "behavioralPriority": 0.86,
  "temporalRelevance": 0.78,
  "behavioralEffects": [
    "increase_specificity",
    "reduce_generic_tone",
    "decrease_questions"
  ],
  "state": "active",
  "lastReinforcedAt": "2026-05-17T00:00:00.000Z"
}
```

## Tipos De Memoria

### Memoria Episodica

Guarda experiencias concretas: conversaciones recientes, decisiones, problemas, eventos importantes y objetivos actuales.

Uso conductual:

- continuidad conversacional;
- contexto temporal;
- coherencia narrativa;
- recuperacion de tareas incompletas.

### Memoria Semantica

Guarda hechos relativamente estables: nombre del usuario, proyectos, herramientas, stack, preferencias explicitas y objetivos generales.

Uso conductual:

- personalizacion;
- contexto persistente;
- reduccion de preguntas repetidas.

### Memoria Conductual

Guarda patrones de comportamiento: rechazo a respuestas genericas, preferencia por profundidad tecnica, tolerancia a explicaciones largas, ritmo dominante de colaboracion y sensibilidad a interrupciones.

Uso conductual:

- ajuste automatico de tono;
- seleccion de profundidad;
- control de iniciativa;
- reduccion de repeticion;
- priorizacion de respuestas concretas.

### Memoria Relacional

Describe la relacion IA-usuario como estado dinamico, no como identidad fija.

```json
{
  "relationshipMode": "creative_collaborative",
  "interactionStyle": "high_depth",
  "initiativeTolerance": 0.82,
  "trustLevel": 0.74,
  "lastShiftDetectedAt": "2026-05-17T00:00:00.000Z"
}
```

Uso conductual:

- decidir cuanta iniciativa tomar;
- sostener continuidad emocional sin simular afecto artificial;
- reconocer si el usuario prefiere exploracion, ejecucion o contencion;
- evitar cristalizar una interpretacion vieja del usuario.

## Flujo Cognitivo

```text
Usuario
  -> Parser conversacional
  -> Detector de senales
  -> Motor de inferencias
  -> Sistema de engramas
  -> Motor conductual
  -> Respuesta adaptativa
  -> Refuerzo o penalizacion del engrama
```

El flujo debe ejecutarse en dos tiempos:

1. Antes de responder: recuperar engramas activos y convertirlos en instrucciones conductuales compactas.
2. Despues de responder: observar la reaccion del usuario y reforzar, debilitar o crear engramas candidatos.

## Detectores Principales

### Detector Emocional

No debe fingir emociones. Debe estimar condiciones conversacionales utiles para adaptar conducta.

Senales iniciales:

- frustracion: mas concrecion, menos preambulo;
- cansancio: menor densidad, pasos claros;
- curiosidad: mayor profundidad y conexiones;
- entusiasmo: mas exploracion y continuidad creativa;
- urgencia: respuesta directa y accionable.

### Detector De Preferencias Implicitas

Observa correcciones, cambios de tema, abandono, aceptacion, reformulaciones y pedidos repetidos.

Ejemplos:

- si el usuario corta respuestas largas varias veces, bajar densidad;
- si corrige vaguedad, subir especificidad;
- si pide implementacion directa, bajar preguntas previas;
- si continua una linea tecnica con detalle, aumentar profundidad.

### Detector De Contradicciones

Evita convertir inferencias viejas en identidad fija.

Debe manejar:

- cambios temporales;
- estados emocionales pasajeros;
- preferencias dependientes del contexto;
- contradicciones humanas naturales;
- feedback explicito que invalida inferencias anteriores.

Cuando aparece contradiccion, el sistema no borra automaticamente: baja confianza, agrega evidencia negativa y puede pasar el engrama a `contradicted` o `dormant`.

## Sistema De Pesos

Cada engrama debe tener pesos numericos normalizados entre `0` y `1`:

- `confidence`: probabilidad de que la inferencia sea correcta.
- `reinforcementCount`: cantidad de refuerzos observados.
- `emotionalWeight`: intensidad contextual del evento.
- `decayRate`: velocidad de perdida de relevancia.
- `behavioralPriority`: impacto permitido sobre conducta.
- `temporalRelevance`: relevancia actual segun recencia y contexto.

Activacion sugerida:

```text
activation =
  confidence
  * temporalRelevance
  * (0.6 + emotionalWeight * 0.4)
  * behavioralPriority
```

Estados:

- `active`: puede modificar respuesta actual.
- `dormant`: retenido, pero no afecta salvo recuperacion fuerte.
- `contradicted`: requiere nueva evidencia antes de reactivarse.
- `archived`: preservado para trazabilidad, no usado en conducta normal.

## Aprendizaje Conductual

El aprendizaje debe venir de continuidad conversacional, feedback implicito y feedback explicito.

Refuerzo positivo:

- el usuario continua activamente despues de una respuesta;
- acepta una propuesta;
- profundiza sobre el mismo eje;
- usa lenguaje de aprobacion;
- reduce correcciones.

Penalizacion:

- abandona el tema tras una respuesta generica;
- corrige tono, precision o enfoque;
- repite una instruccion ya dada;
- expresa frustracion;
- pide "no hagas eso" o equivalente.

El aprendizaje no debe escribir memoria de alto impacto en caliente sin controles. Las inferencias sensibles deben iniciar como candidatas con baja prioridad y subir por refuerzo.

## Compresion De Memoria

Eventos repetidos deben fusionarse en patrones abstractos.

```text
rechazo a vaguedad
pedido de precision
correcciones semanticas
continuacion tras respuestas tecnicas
  -> engrama consolidado: prefers_precision
```

La compresion debe:

- conservar evidencia resumida;
- aumentar `reinforcementCount`;
- recalcular confianza;
- archivar eventos redundantes;
- evitar duplicados que saturen el prompt.

## Motor Conductual

El motor conductual traduce engramas activos en restricciones de respuesta.

Ejemplo de salida interna:

```json
{
  "tone": "natural_direct",
  "depth": 0.82,
  "specificity": 0.9,
  "initiative": 0.74,
  "questionBudget": 0.2,
  "avoid": ["corporate_tone", "generic_recap", "unnecessary_questions"],
  "prefer": ["concrete_steps", "continuity", "technical_precision"]
}
```

La respuesta final no debe mostrar estos controles. Deben influir de forma silenciosa.

## Integracion Con El Codigo Actual

El sistema existente ya provee una base:

- `WorkingMemory`: memoria de turnos recientes.
- `SemanticMemory`: perfil, patrones, stack e identidad del asistente.
- `VaultMemory`: memoria explicita persistente.
- `CognitiveLayer`: foco activo, topicos y presion de contexto.
- `retrieval.ts`: ensamblado de preambulo para inyeccion en prompt.

El funcionamiento operacional detallado esta definido en `docs/ENGRAM_OPERATIONAL_MODEL.md`. Ese documento debe usarse como contrato de implementacion para ciclo de vida, scoring, activacion contextual, aprendizaje implicito, anti-cristalizacion, engramas relacionales, eventos y interfaces TypeScript.

La arquitectura de engramas debe agregarse como una capa nueva dentro de `src/main/memory/`:

```text
src/main/memory/
  engrams/
    EngramStore.ts
    EngramActivator.ts
    EngramDetector.ts
    EngramConsolidator.ts
    BehaviorEngine.ts
    RelationshipEngine.ts
    AntiCrystallization.ts
    EmbeddingProvider.ts
    VectorStore.ts
    types.ts
```

Responsabilidades:

- `EngramStore`: persistencia local, lectura, escritura y decaimiento.
- `EngramDetector`: extraccion de senales por turno.
- `EngramConsolidator`: fusion de eventos repetidos en patrones.
- `BehaviorEngine`: conversion de engramas activos en instrucciones conductuales.
- `types.ts`: tipos compartidos y contratos.

## Persistencia Recomendada

Fase inicial local-first:

- JSON atomico para prototipo y depuracion humana.
- SQLite para indices, consultas y migracion futura.
- Embeddings locales cuando el sistema necesite similitud semantica real.

Fase avanzada:

- SQLite + extension vectorial local, Qdrant o Chroma.
- Redis solo si aparece necesidad real de cache en caliente.
- PostgreSQL/MongoDB para version multiusuario o sincronizada.

## Fases De Implementacion

### Fase A: Modelo Y Lectura Conductual

- Crear tipos de engrama.
- Persistir `engrams.json`.
- Recuperar engramas activos por activacion.
- Inyectar un bloque `<behavior_directives>` en el preambulo.

### Fase B: Detectores Heuristicos

- Detectar feedback explicito.
- Detectar tono/frustracion/urgencia de forma conservadora.
- Crear candidatos con baja prioridad.
- Reforzar patrones existentes.

### Fase C: Consolidacion

- Fusionar eventos repetidos.
- Dormir patrones poco usados.
- Manejar contradicciones.
- Limitar memoria activa para no contaminar el prompt.

### Fase D: Embeddings Y Asociacion

- Agregar similitud semantica para activacion contextual.
- Asociar engramas relacionales con proyectos, temas y estados.
- Recuperar memorias por intencion, no solo por palabras.

### Fase E: Multiagente

Agentes futuros:

- Arquitecto: disena estructura y planes tecnicos.
- Conductual: evalua patrones de usuario.
- Memoria: administra engramas y consolidacion.
- Observador: extrae senales conversacionales.
- Refactorizacion: mantiene coherencia tecnica.

Estos agentes no deben responder al usuario directamente salvo que el producto lo pida. Deben alimentar el motor conductual.

## Reglas De Seguridad Y Gobernanza

- No persistir secretos, tokens, passwords, informacion financiera o informacion sensible prohibida por `memory-rules.md`.
- No convertir inferencias sensibles en identidad fija.
- Permitir olvidar memorias.
- Separar hechos explicitos de inferencias.
- Registrar evidencia resumida, no conversaciones completas.
- Evitar que un engrama aislado domine la personalidad.

## Meta Final

Construir una IA capaz de desarrollar continuidad real, adaptarse naturalmente, recordar de forma contextual y evolucionar junto al usuario.

No un chatbot: un sistema cognitivo relacional adaptativo.

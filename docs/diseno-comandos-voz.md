# Comandos de voz — diseño

Rubén habla y la app hace el cambio: *"el 1234 está terminado"*, *"el 5678 bloqueado, falta la bomba de agua"*.

## Flujo

```
 Inicio
 ┌────────────────────────────┐
 │ lista de coches…           │
 │                    [🎤] [+]│  ← botón de micro junto a "Nuevo"
 └────────────────────────────┘
        │ mantener pulsado y hablar (o tocar para empezar / parar)
        ▼
 ┌────────────────────────────┐     Whisper en el móvil (ya lo usamos en las notas de voz)
 │ 🎙 Escuchando… 0:03        │ ──▶ texto: "el 1234 está terminado"
 └────────────────────────────┘
        ▼                            intérprete (reglas, sin IA de pago)
 ┌────────────────────────────┐ ◀── { coche: 1234BCD, acción: estado=blue }
 │ "el 1234 está terminado"   │
 │                            │
 │  1234 BCD  Seat Ibiza      │
 │  🟢 En curso → 🔵 Terminado│
 │                            │
 │  [Corregir]   [Confirmar]  │  ← nunca se aplica sin confirmar
 └────────────────────────────┘
        ▼
   PATCH /api/cars/:plate  o  POST /api/events   (los endpoints que ya existen)
```

## Qué entiende (fase 1)

| Dice | Hace |
|---|---|
| "terminado", "listo", "acabado" | 🔵 Terminado |
| "en curso", "empiezo con", "estoy con" | 🟢 En curso |
| "en espera", "esperando" | 🟡 En espera |
| "bloqueado", "parado" + motivo | 🔴 Bloqueado. El motivo se deduce: "presupuesto" → Sin presupuesto, "no acepta" → El cliente no acepta, "falta / pieza / material" → Sin material. El resto de la frase va como nota. |
| "quita el estado" | Sin estado |
| "diagnosticado, …" | Evento Diagnosticado con el resto como texto |
| "reparación, …" / "he cambiado …" | Evento Reparación con el resto como texto |
| "ha salido", "se lo ha llevado", "entregado" | Evento Salida |

Si no entiende la acción, ofrece guardar la frase como evento sin tipo para ese coche. Si no reconoce el coche, pide elegirlo de la lista.

## Lo difícil: reconocer la matrícula de palabra

Whisper escribe las matrículas de formas muy distintas: "1234 BCD", "mil doscientos treinta y cuatro be ce de", "uno dos tres cuatro"…

Solución: **buscar solo entre los coches que están en el taller**, empezando por los números.

```
 texto ──▶ extraer números ("mil doscientos treinta y cuatro" → 1234)
              │
              ▼
       coches dentro del taller cuyos 4 dígitos = 1234
              │
     ┌────────┼─────────────┐
     1        varios         0
     │        │              │
   ese     desempatar por  buscar en todos
   coche   letras dichas   los coches; si nada,
           o preguntar     elegir de la lista
```

Normalmente hay pocos coches dentro y casi nunca comparten los 4 números, así que basta con decir *"el 1234"*. También vale decir la marca o el modelo: *"el Ibiza está terminado"*.

## Decisiones

| Tema | Decidido |
|---|---|
| Intérprete | **Reglas en el móvil.** Gratis, funciona sin conexión y es predecible. Claude API queda para más adelante, como respaldo si hiciera falta. |
| Confirmación | **Siempre** se muestra la tarjeta y se pulsa Confirmar. |
| Dónde está el micro | En inicio, junto a "Nuevo". |
| Fase 2 | Varios comandos seguidos (*"el 1234 terminado y el 5678 en curso"*) y cronómetros por voz (*"Max empieza con el 1234"*). |

## Tiempos de respuesta

- **La primera vez** se descargan unos 135 MB del modelo. Si ya se usaron las notas de voz en ese móvil, el modelo ya está en caché.
- **Una frase corta** (2–4 s de audio) tarda unos 2–5 s en transcribirse en un iPhone reciente. Mientras tanto se muestra "Entendiendo…".

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/voice-command.ts` (nuevo) | Pasar números dichos a cifras, buscar el coche y detectar la acción. Funciones puras, fáciles de probar. |
| `src/components/VoiceCommand.tsx` (nuevo) | Botón de micro, grabación, hoja de confirmación. Reutiliza la grabación de `VoiceRecorder` y `transcribe()`. |
| `src/app/page.tsx` | Añadir el botón junto a "Nuevo". |
| API / base de datos | Sin cambios. Usa los endpoints que ya existen. |

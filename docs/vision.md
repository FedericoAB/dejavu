---
tipo: plan
ultima_revision: 2026-09-12
---

> **Alcance:** este documento describe la visión ampliada. El MVP implementado y sus límites están en [revision-mvp.md](revision-mvp.md) y [ADR-0007](decisions/ADR-0007-mvp-vertical.md). No tomar los componentes previstos como integraciones ya disponibles.

# Visión

## El problema

El trabajo de oficina tiene una capa invisible: el pegamento. Copiar de una
planilla, buscar el dato de un cliente, calcular, redactar el mismo correo,
adjuntar, enviar, marcar la tarea. Nadie lo documenta porque "es solo un rato",
y se hace cuarenta veces por mes.

Las herramientas de IA actuales resuelven mal esto porque **esperan una orden**.
Para pedirle a un agente que haga el pegamento primero hay que describir el
pegamento, y describirlo cuesta más que hacerlo.

## La tesis

> El agente no debería esperar la instrucción. Debería reconocer cuándo puede ayudar.

Déjà Vu invierte la relación: observa, reconoce la repetición, y **ofrece**.
El usuario nunca escribe un prompt. Su único acto es apretar "Sí".

## Por qué el entorno es esencial (y no decorado)

El desafío pide un agente que sea *meaningfully more useful* por el lugar donde vive.
Déjà Vu no puede existir fuera de su entorno, por tres razones:

1. **Sin observación no hay detección.** El valor completo nace de estar adentro
   del lugar donde el trabajo ocurre. Un chatbot en una pestaña aparte no ve nada.
2. **Sin las mismas apps no hay ejecución.** Detectar el patrón es la mitad; la
   otra mitad es tener manos: el mismo Mail, las mismas Sheets, el mismo CRM.
   Ambiguous se las da como miembro del equipo, no como integración externa.
3. **Sin identidad propia no hay confianza.** El agente tiene su casilla, su
   nombre en el canal y su avatar en la tarea. Cuando manda el reporte, el
   equipo ve quién lo mandó y puede responderle por correo.

## El demo asesino (2 minutos)

| t | Qué se ve |
|---|---|
| 0:00 | Pantalla partida: workspace de Ambiguous a la izquierda, navegador a la derecha. Sin chat abierto. |
| 0:10 | **Vuelta 1.** El humano hace el flujo a mano: abre la planilla de cobranzas → busca la empresa morosa en la web → copia el dato → arma el doc → manda el mail al ejecutivo → marca la tarea. Cronómetro: ~2 min. |
| 0:50 | **Vuelta 2.** Lo mismo con otro cliente. Abajo a la derecha aparece un indicador tenue: *"Déjà Vu está mirando · 1 patrón en formación"*. |
| 1:15 | **Vuelta 3.** Al primer paso, la interrupción: **"Hiciste esto 2 veces. Son 6 pasos y ~2 minutos cada vez. ¿Lo hago yo?"** con la rutina desplegada paso por paso y los parámetros detectados resaltados. |
| 1:25 | Click en **Sí**. Ejecución en vivo: cada paso se tilda. En `mail.send` se frena y pide aprobación; llega el push al teléfono (Auth0), se aprueba desde ahí. |
| 1:45 | El correo llega **de parte del agente** a la casilla del equipo en Ambiguous. La tarea queda cerrada por él. |
| 1:50 | Tablero de métricas: 3 detecciones, 1 aceptada, 6 pasos automatizados, 1m52s ahorrados por corrida. |

Regla de oro del video: **no se escribe un solo prompt**. Esa es la idea entera.

## Qué NO es

- No es un grabador de macros: los pasos se reconocen por *rol semántico*, no por
  coordenadas del mouse. Cambia el layout y la rutina sigue andando.
- No es RPA: no simula clicks para ejecutar; ejecuta llamando a las APIs reales.
- No es un chatbot con contexto: el chat es la salida de emergencia, no la entrada.

## Alcance del día

**Dentro:** detección real sobre eventos reales, compilación de rutina, ejecución
de 6 tipos de paso, aprobación humana, tablero de métricas.

**Fuera (declarado):** multiusuario real, aprendizaje entre usuarios, edición
gráfica de rutinas, navegador headless para sitios sin API.

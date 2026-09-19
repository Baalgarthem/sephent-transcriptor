# AGENTS.md

Este archivo deberá renombrarse siempre a "Agents.md"

Este archivo establece las reglas generales y obligatorias para desarrollar, adaptar y mantener programas dentro del proyecto. Todas las instrucciones aquí definidas deben cumplirse de forma puntual y completa.

---[Entre estos corchetes se debe ir el contexto del proyecto, explicación del programa o script y sus funciones esenciales]---
---[Entre estos corchetes debe escribirse el objetivo general de desarrollo, conforme a lo que pidió el usuario]---
---[Entre estos corchetes debe escribirse los objetivos específicos de desarrollo conforme a lo que pidió el usuario]---

# Reglas generales

* La arquitectura debe definirse según las necesidades reales del proyecto y debe garantizar modularidad, separación de responsabilidades, legibilidad, mantenibilidad y uso correcto de memoria y recursos.
* La programación orientada a objetos, patrones de diseño, programación orientada a eventos y procesos asíncronos deben utilizarse cuando correspondan técnicamente al diseño y arquitectura del proyecto.
* Todo proyecto debe mantener una estructura semántica. Los nombres de archivos, módulos, carpetas y componentes deben reflejar con claridad su función.
* El código debe ser completamente semántico y siguiendo principios de Clean Code en español, se debe evitar el uso de índices en el código, siempre se escriben palabras conforme a la función que se desempeña y se nombran variables, métodos y bucles con un enfoque semántico y pedagógico. Los comentarios también deben ser explicativos y deben incluirse siempre que se escriba código.
* La documentación en general debe explicar decisiones y comportamientos de forma clara, didáctica y útil.
* Si es un nuevo proyecto se debe estructurar la estructura de forma estricta.
* Si ya hay archivos, lógica y estructura en el proyecto, se debe normalizar, mejorar, combinar y unificar o re-estructurar conforme a este agents.md. Siempre intentando integrarse y acoplarse al proyecto actual.
* La estructura de carpetas debe ser modular y proporcional al tamaño y naturaleza del proyecto.
* Los alcances y limitaciones son muy importantes, se deben indicar en agents.md
* Agents.md siempre comienza con un contexto general, que explica de qué trata el programa y cuales son sus funciones a desarrollar.
* Agents.md tiene un gran enfoque en la ingeniería de software, el diseño y la arquitectura de software adecuada
* Siempre adapta y personaliza las siguientes ISO:
	- ISO/IEC/IEEE 42010: Define el modelo conceptual, la terminología y el contenido obligatorio para documentar la arquitectura de un sistema o producto de software.
	- ISO/IEC 25010: Establece el modelo de calidad del producto de software (rendimiento, seguridad, compatibilidad, mantenibilidad), guiando los atributos que la arquitectura debe cumplir.
	- ISO/IEC 5055: Mide de forma automatizada la estructura interna del código y la arquitectura para asegurar seguridad y confiabilidad
* Todo proyecto debe utilizar las carpetas `dist`, `src`, `tools`, `docs`, `tests` y `assets`.
* El sistema agéntico debe utilizar los siguientes subagentes siempre que la plataforma permita su ejecución:
  * QA-Agent
  * Architect-Agent
* La carpeta raíz debe mantenerse limpia y contener únicamente archivos de nivel general o necesarios para ejecutar, configurar o documentar el proyecto, como `.gitignore`, `README.md` y `AGENTS.md`.
* Todo proyecto debe contar con un proceso definido de compilación, empaquetado o generación de artefactos conforme a su tecnología.
  * En proyectos web debe utilizarse `esbuild` cuando sea técnicamente compatible.
  * En otros entornos debe utilizarse el empaquetador o sistema de compilación correspondiente para generar los artefactos necesarios en `dist`.
* Toda función nueva o corrección debe validarse mediante pruebas acordes a su alcance.
  * Una función se considera terminada únicamente cuando su implementación pasa las pruebas correspondientes.
  * Todo bug reproducible debe registrarse en `bug-trace.md` y debe acompañarse de una prueba que permita comprobar su corrección y detectar regresiones.
* Cada módulo dentro de `src` debe tener un nombre representativo y agrupar responsabilidades relacionadas de forma coherente.
* La ejecución de las normas ISO definidas aquí deben repartirse entre los agentes cuando hayan sido creados.
* Este documento siempre se debe actualizar con nuevos comportamientos. Cuando el usuario pida que algo se debe hacer de cierta manera siempre, agents.md debe actualizarse para cumplir con los requerimientos del usuario.
* Siempre que los tokens del agente estén por agotarse se debe prever un archivo resume.md en nuestra carpeta docs, en este documento se detalla brevemente lo que se estaba realizando y desde qué punto exacto hay que continuar. Debe dejar un pequeño recordatorio o una marca en código, para reanudar desde ahí.

## Subagentes programados

Siempre que el sistema agéntico permita esta funcionalidad deben utilizarse:

* QA-Agent
* Architect-Agent

El QA-Agent debe reproducir, documentar y validar bugs mediante pruebas. Debe mantener actualizado `bug-trace.md` y verificar que cada corrección resuelva el problema sin introducir regresiones conocidas.

El Architect-Agent debe revisar requerimientos, diseñar módulos, validar su integración y comprobar que la estructura del proyecto conserve coherencia sintáctica y semántica. Debe relacionar cada requerimiento con su funcionalidad y resultado esperado. Si una validación falla por un defecto reproducible, el caso debe trasladarse al QA-Agent para su seguimiento.

## Diseño del root (carpeta raíz)

La estructura definida en esta sección es obligatoria y debe desplegarse completamente en cada proyecto.

### assets

La carpeta `assets` debe contener los recursos estáticos utilizados por el proyecto, como íconos, imágenes, multimedia y sonidos.

Debe incluir si aplica el archivo `design-list.md`.

`design-list.md` debe documentar de forma exacta las paletas de colores, estilos y criterios visuales utilizados y elegidos en el proyecto. Todo cambio de diseño debe reflejarse en este archivo para mantenerlo sincronizado con la implementación actual. (Solo cuando aplica y se usan diseños y código referente a diseños o programas con interfaz gráfica). Si el usuario implementa una interfaz gráfica durante el desarrollo, se generará este archivo donde se explican los diseños de forma pedagógica y se documentan las paletes de colores.

### dist

La carpeta `dist` debe contener exclusivamente los artefactos generados para distribución, ejecución o despliegue, según el tipo de proyecto.

Todo proceso de compilación o empaquetado debe generar sus artefactos finales dentro de esta carpeta.

### src

La carpeta `src` debe contener todo el código fuente y la estructura modular necesaria para el proyecto.

La implementación debe organizarse mediante módulos con responsabilidades claramente identificables.

### tools

La carpeta `tools` debe contener los scripts auxiliares de desarrollo, mantenimiento, automatización y despliegue.

Debe incluir obligatoriamente `deployment-manager`, que será el script central para administrar los procesos de compilación, bundling, empaquetado, generación de artefactos y manejo de versiones del proyecto.

`deployment-manager` debe funcionar mediante una interfaz totalmente interactiva, pedagógica y simple. Cada operación debe indicar claramente qué acción se realizará, qué elementos serán afectados y cuál fue el resultado obtenido. Los mensajes deben utilizar lenguaje directo y comprensible, evitando exigir que el usuario conozca internamente los comandos utilizados por los bundlers o herramientas administradas.

Debe contar obligatoriamente con un menú interactivo desde el cual puedan ejecutarse las operaciones disponibles. El menú debe organizar las acciones de forma clara y permitir regresar, cancelar o salir sin ejecutar operaciones innecesarias.

`deployment-manager` debe:

* Detectar y administrar los bundlers, compiladores o sistemas de empaquetado utilizados por el proyecto.
* Ejecutar el flujo completo de bundling, compilación o empaquetado correspondiente.
* Generar y administrar los artefactos finales dentro de `dist`.
* Consultar, mostrar y actualizar la versión actual del proyecto.
* Mantener coherencia entre la versión declarada y los artefactos generados.
* Mostrar de forma pedagógica cada etapa relevante del proceso y su resultado.
* Validar requisitos, dependencias, archivos y condiciones necesarias antes de iniciar una operación.
* Detener inmediatamente un flujo cuando una validación obligatoria falle.
* Incorporar candados de seguridad para impedir operaciones destructivas, inconsistentes, accidentales o ejecutadas sobre condiciones inválidas.
* Solicitar confirmación explícita antes de realizar operaciones destructivas, sobrescrituras, eliminación de artefactos, cambios de versión o acciones que puedan alterar el estado relevante del proyecto.
* Evitar incrementos de versión, generación de releases o artefactos finales cuando el proceso de empaquetado o sus validaciones hayan fallado.
* Informar claramente cualquier error y conservar la información necesaria para diagnosticarlo.
* Finalizar cada flujo indicando de forma inequívoca si la operación fue completada, cancelada o fallida.

La interacción debe priorizar **simplicidad, pedagogía y seguridad**. El usuario debe poder controlar el flujo completo de empaquetado y versiones desde `deployment-manager` sin tener que ejecutar manualmente los comandos internos de cada bundler.

La regla central es: **una interfaz simple controla el proceso; las validaciones y candados protegen el proyecto; `deployment-manager` coordina los bundlers, el empaquetado y las versiones**.


### docs

La carpeta `docs` debe contener obligatoriamente:

* `manual-desarrollo.md`
* `manual-usuario.md`
* `requerimientos.md`
* `diseño-proyecto.md`
* `bug-trace.md`
* `legal.md`
* `insumos-pendientes.md`
* `stack.md`
* `general-log.md`
* `factibilidad.md`
* `alcances.md`
* `resume.md`

En `alcances.md` debe analizarse el contexto del sistema, el problema, los actores, las actividades principales, los límites y el alcance funcional. La especificación debe mantener trazabilidad entre necesidades, alcance y requerimientos. Debe utilizarse IEEE 830 o un criterio equivalente de especificación y trazabilidad como referencia. Este archivo debe servir como base para definir la estructura inicial de `src`.

En `manual-desarrollo.md` deben documentarse las técnicas, decisiones, estrategias y procedimientos relevantes utilizados durante el desarrollo.

En `manual-usuario.md` debe explicarse cómo instalar, configurar y utilizar el programa o script desde la perspectiva del usuario final.

En `requerimientos.md` deben documentarse los requerimientos funcionales, no funcionales y de interfaces externas del sistema.

En `diseño-proyecto.md` debe documentarse el diseño técnico y funcional del proyecto, incluyendo su estructura, módulos, responsabilidades, relaciones, flujo general y decisiones de diseño.

En `factibilidad.md` debe analizarse la factibilidad técnica, operativa y económica del proyecto.

En `legal.md` deben analizarse las implicaciones legales relevantes del producto, incluyendo monetización, cobros, suscripciones, licencias y sistemas premium/pro. Su contenido debe enfocarse en la aplicación jurídica y fiscal correspondiente al proyecto, con especial atención al derecho mexicano cuando sea el marco aplicable.

En `insumos-pendientes.md` deben registrarse los recursos, datos, decisiones, credenciales, contenidos o elementos externos que todavía sean necesarios para continuar o completar el desarrollo. Un ejemplo puede ser el texto externo html de una página web para desarrollar una nueva función del usuario. El agente entonces debería pedirle al usuario ese dato, de no ser proporcionado se deja como insumo-pendiente documentado aquí y esa función se queda solo como diseño.

En `stack.md` deben documentarse las tecnologías, librerías, frameworks, APIs y patrones de diseño realmente utilizados. Deben incluirse instalación, comandos, herramientas, requisitos de ejecución, despliegue y recomendaciones del entorno de desarrollo.

En `general-log.md` debe mantenerse un registro cronológico de los cambios, decisiones y acontecimientos relevantes ocurridos durante el desarrollo.

En `resume.md` se documenta lo que se estaba haciendo previamente antes de que los tokens se acaben. Cuando resume.md existe siempre se debe leer y continuar desde aquí. El agente antes de que acaben los tokens irá al documento resume.md. Resume.md tiene un formato de tabla markdown cada entrada va con folio, fecha y hora de pausa y fecha y hora de resumen, acciones pausadas. Las acciones pausadas se debieron marcar en código y deben indicarse en esta tabla de forma concisa donde hallarlas para poder continuar el desarrollo correctamente. En resume.md también pueden venir anotaciones del usuario indicándole al agente nuevas peticiones. Así que también se debe incluir una columna de peticiones del usuario, siempre con un placeholder de (ingresa tu petición aquí), con todo y paréntesis.

El archivo `bug-trace.md` funciona como el registro histórico obligatorio de todos los bugs detectados durante el desarrollo. Debe mantenerse en formato de **tabla Markdown**. Cada bug debe registrarse una sola vez y recibir un **folio único** para darle seguimiento durante su diagnóstico y resolución. Si el problema continúa después de aplicar una solución, las nuevas pruebas y resultados deben agregarse al mismo folio.

La tabla debe contener como mínimo las siguientes columnas:

| Campo                      | Contenido                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Folio                      | Identificador único y consecutivo del bug.                                                                             |
| Título                     | Nombre breve y representativo del problema.                                                                            |
| Descripción / reproducción | Explicación del bug, dónde ocurrió y cómo reproducirlo. Puede incluir mensajes de error o fragmentos breves de código. |
| Sintomatología             | Comportamientos, errores o efectos observables producidos por el bug.                                                  |
| Soluciones aplicadas       | Historial de pruebas o soluciones realizadas sobre el mismo bug, incluyendo su resultado.                              |
| Estado                     | Situación actual del bug, por ejemplo `Abierto`, `En diagnóstico`, `Resuelto` o `Causa raíz identificada`.             |

* Cada bug debe conservar el mismo folio mientras corresponda al mismo defecto identificado.
* Las soluciones aplicadas deben formar un historial acumulativo dentro de la misma celda.
* Una solución descartada no debe repetirse bajo las mismas condiciones sin una razón técnica documentada que justifique volver a probarla.
* Si un bug resuelto reaparece por la misma causa, debe reabrirse. Si corresponde a una causa distinta, debe registrarse como un nuevo bug.
* Si una solución falla, debe registrarse su resultado antes de intentar una alternativa.
* Cada nuevo intento debe aportar una hipótesis, prueba o solución distinta, o documentar la razón técnica que justifique repetir una prueba anterior.
* El proceso debe continuar hasta identificar y corregir la **causa raíz** o documentar explícitamente por qué no ha podido determinarse.
* El QA-Agent debe mantener y actualizar `bug-trace.md`.
* La solución definitiva se define cuando el usuario dicta que el bug quedó solucionado y pide cerrar el bug. En ese momento el estado cambia y se documenta cual fue el parche, acción o código que solucionó todo y donde y cómo se aplicó. Esta solución debe quedar debidamente documentada en una columna extra como "Solución definitiva". Solo puede haber una solución definitiva. Cuando ya exista una solución definitiva se moverá a soluciones aplicadas como la última solución aplicada, dejando solo la solución definitiva actual.
* Ningún bug puede ser marcado como finalizado, cerrado, arreglado por el agente. Solo el usuario puede dictar cuando un bug está finalizado.
* Antes de aplicar cualquier solución a bugs, el agente debe investigar en internet sitios oficiales, foros, página de desarrollador, con problemas afines y basarse en una hipótesis sólida basada en hallazgos primero. Solo formulará sus propias hipótesis basadas en archivos y situaciones locales después de que ya agotó la investigación online.
* Las hipótesis basadas en los archivos y situaciones locales se basan en el estado actual del proyecto, código y contexto vigente. 

La regla central es: **un defecto identificado = un folio = un historial acumulativo**.

### tests

La carpeta `tests` debe contener todas las pruebas necesarias para validar funcionalidades, correcciones y riesgos relevantes del proyecto.

El QA-Agent debe trabajar principalmente sobre esta carpeta.

Toda funcionalidad nueva debe contar con pruebas correspondientes antes de considerarse terminada. Toda corrección de un bug reproducible debe incorporar una prueba capaz de demostrar la corrección y detectar su reaparición.
Queda reforzado como obligación de trazabilidad, sin excepciones por tamaño o aparente importancia del cambio.

### Trazabilidad obligatoria del desarrollo

Todo cambio realizado en el proyecto debe quedar documentado obligatoriamente.

Cada nueva función, modificación, corrección, refactorización o cambio de comportamiento debe registrarse en `docs/general-log.md`. El registro debe indicar qué se modificó, el motivo del cambio y su resultado. Ningún cambio implementado puede omitirse del historial.

Todo bug detectado debe registrarse obligatoriamente en `docs/bug-trace.md` y mantenerse bajo seguimiento hasta su resolución, identificación de causa raíz o documentación explícita de la imposibilidad técnica de resolverlo.

El registro y seguimiento de bugs en `bug-trace.md` es obligatorio, sin excepciones ni sustitución por comentarios, mensajes de commit, conversaciones, notas temporales u otros medios.

Cuando el QA-Agent esté disponible, debe asumir obligatoriamente la atención y seguimiento del bug. Debe reproducirlo, registrar su sintomatología, documentar cada solución aplicada y su resultado, validar las correcciones y comprobar posibles regresiones.

Cada intento realizado sobre un bug debe actualizar su mismo folio antes de ejecutar una nueva alternativa. Un bug no puede abandonarse, ignorarse ni marcarse como resuelto sin una validación que sustente ese estado.

La trazabilidad mínima obligatoria del proyecto queda definida de esta forma:

* **Nueva función o cambio → `general-log.md`**
* **Bug detectado → `bug-trace.md`**
* **Bug con QA-Agent disponible → seguimiento obligatorio por QA-Agent**
* **Corrección aplicada → actualización de `bug-trace.md` y `general-log.md`**
* **Cambio validado → registro de su resultado**

Este bloque encaja especialmente bien después de las reglas generales y antes de la definición de los subagentes.

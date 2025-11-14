🗺️ Planificador de Ruta GPX 
Descripción 

El Planificador de Ruta GPX es una aplicación web intuitiva y potente para visualizar, analizar y editar rutas GPS en formato GPX. Permite a usuarios cargar sus propios archivos GPX, editar waypoints de manera interactiva sobre un mapa, calcular parámetros técnicos de la ruta (distancia, desnivel, tiempos estimados, dificultades) y generar informes exportables en Excel y PDF. 

Ideal para senderistas, ciclistas, clubes de montaña y cualquier persona que necesite planificar o documentar rutas sobre mapa. 
Características principales 

    Carga de archivos GPX mediante selección o arrastrar y soltar.
    Visualización interactiva de la ruta sobre mapa (OpenStreetMap, Satélite, Topográfico).
    Perfil de elevación integrado.
    Edición avanzada de waypoints:
        Añadir, eliminar y editar puntos de interés.
        Edición directa sobre el mapa.
        Panel de edición de nombres y descripciones.
        Funcionalidad Deshacer/Rehacer para los cambios.
         
    Cálculo automático de:
        Distancia y desnivel acumulado.
        Tiempos estimados por tramo y totales.
        Parámetros técnicos y físicos de la ruta.
         
    Generación de tablas:
        Ficha principal de la ruta.
        Tablas detalladas por cada tramo (entre waypoints).
         
    Exportación de tablas a Excel (.xlsx) y PDF.
    Interfaz moderna, responsive y con soporte para modo claro/oscuro.
     

Demo 

(Incluye aquí una captura de pantalla o un enlace a una demo online si la tienes) 
Instalación 

     

    Clona este repositorio: 
    bash
     
     

     
    1
    2
    git clone https://github.com/usuario/proyecto-gpx.git
    cd proyecto-gpx
     
     
     

    Abre el archivo index.html en tu navegador. 
     

    No se requieren dependencias ni instalación adicional. Todo funciona en el navegador. 
     

Requisitos 

    Navegador web moderno (Chrome, Firefox, Edge, Safari)
    Conexión a Internet para cargar las bibliotecas externas (Leaflet, XLSX, jsPDF, etc.)
     

Tecnologías usadas 

    Leaflet.js  – Mapa interactivo
    Leaflet.Elevation  – Perfil de elevación
    SheetJS/xlsx  – Exportación a Excel
    jsPDF  + jsPDF-AutoTable  – Exportación a PDF
     

Uso básico 

     Carga tu archivo GPX haciendo clic en el área designada o arrastrando el archivo.
     Visualiza la ruta sobre el mapa y accede al perfil de elevación.
     Edita los waypoints usando los controles del panel izquierdo.
     Rellena la información del grupo y pulsa "Generar tabla".
     Descarga la ficha e informes en Excel o PDF según tu necesidad.
     

Estructura del proyecto 
 
 
 
1
2
3
4
5
6
proyecto-gpx/
│
├── index.html      # Página principal
├── style.css       # Estilos de la aplicación
├── script.js       # Lógica principal en JavaScript
└── README.md       # Este archivo
 
 
Futuras mejoras 

    Soporte para más formatos de archivo (KML, GeoJSON, FIT)
    Integración con otras plataformas y APIs de mapas
    Mejoras en la precisión de cálculos y edición avanzada de tracks
    Compartir rutas y tablas en la nube
     

Licencia 

Este proyecto se publica bajo la licencia MIT.
(O adapta aquí tu licencia si lo prefieres) 

¡Gracias por usar el Planificador de Ruta GPX!
Para cualquier duda o sugerencia, abre un issue  o contacta al autor. 